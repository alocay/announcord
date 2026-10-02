import { PassThrough } from 'node:stream';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type AudioPlayerState,
  type VoiceConnection,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import { SkipAnnouncement, type VoiceTransport } from '../announce/guildAnnouncer.js';
import type { Logger } from '../logger.js';

const READY_TIMEOUT_MS = 10_000;
const RECONNECT_GRACE_MS = 5_000;
const PLAYBACK_TIMEOUT_MS = 30_000;
const ARRIVAL_POLL_MS = 50;

/** Returns why the bot cannot speak in the channel, or null if it can. */
export function joinProblem(guild: Guild, channelId: string): string | null {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return 'not a voice channel';

  const me = guild.members.me;
  const permissions = me && channel.permissionsFor(me);
  if (!permissions) return 'permissions unknown';
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) return 'missing View Channel permission';
  if (!permissions.has(PermissionFlagsBits.Connect)) return 'missing Connect permission';
  if (!permissions.has(PermissionFlagsBits.Speak)) return 'missing Speak permission';
  if (channel.full && !permissions.has(PermissionFlagsBits.MoveMembers)) return 'channel is full';
  return null;
}

/** Owns one guild's voice connection and audio player. */
export class DiscordVoiceTransport implements VoiceTransport {
  private connection: VoiceConnection | null = null;
  private readonly player: AudioPlayer = createAudioPlayer();
  private readonly warnedChannels = new Set<string>();

  constructor(
    private readonly guild: Guild,
    private readonly log: Logger,
    private readonly onDisconnected: () => void,
  ) {
    // Errors during play() are handled there; this keeps a stray error event
    // outside playback from crashing the process.
    this.player.on('error', (error) => this.log.debug({ err: error }, 'audio player error'));
  }

  currentChannelId(): string | null {
    return this.connection?.joinConfig.channelId ?? null;
  }

  async play(channelId: string, clip: Buffer): Promise<void> {
    await this.connect(channelId);

    const stream = new PassThrough();
    stream.end(clip);
    // The clip is already Ogg/Opus, so it is demuxed and sent as-is.
    const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });
    await this.playToEnd(resource);
  }

  leave(): void {
    this.player.stop(true);
    const connection = this.connection;
    this.connection = null;
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  }

  private async connect(channelId: string): Promise<void> {
    const current = this.connection;
    if (
      current &&
      current.joinConfig.channelId === channelId &&
      current.state.status === VoiceConnectionStatus.Ready
    ) {
      return;
    }

    const problem = joinProblem(this.guild, channelId);
    if (problem) {
      if (!this.warnedChannels.has(channelId)) {
        this.warnedChannels.add(channelId);
        this.log.warn({ guildId: this.guild.id, channelId, problem }, 'cannot announce in channel');
      }
      throw new SkipAnnouncement(`Cannot join channel ${channelId}: ${problem}`);
    }

    // For a guild that already has a connection this moves it to the new channel.
    const connection = joinVoiceChannel({
      channelId,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    if (connection !== this.connection) {
      this.connection = connection;
      this.watch(connection);
      connection.subscribe(this.player);
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
      await this.arrived(channelId);
    } catch (error) {
      this.drop(connection);
      throw new Error(`Could not connect to voice channel ${channelId}`, { cause: error });
    }
  }

  /**
   * Waits until Discord shows the bot in the channel. Moving an established
   * connection keeps its status at Ready throughout, so without this a clip
   * could start while the bot is still in the previous channel.
   */
  private async arrived(channelId: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (this.guild.members.me?.voice.channelId !== channelId) {
      if (Date.now() > deadline) throw new Error('Timed out waiting to arrive in the channel');
      await new Promise((resolve) => setTimeout(resolve, ARRIVAL_POLL_MS));
    }
  }

  private watch(connection: VoiceConnection): void {
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      // A move between channels or a region change recovers by itself and
      // shows up as a new signalling/connecting phase. Anything else is a kick.
      Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
        entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
      ]).catch(() => {
        if (this.connection !== connection) return;
        this.drop(connection);
        this.onDisconnected();
      });
    });
  }

  private drop(connection: VoiceConnection): void {
    this.player.stop(true);
    if (this.connection === connection) this.connection = null;
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
  }

  private playToEnd(resource: ReturnType<typeof createAudioResource>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.player.off('stateChange', onStateChange);
        this.player.off('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onStateChange = (_old: AudioPlayerState, next: AudioPlayerState) => {
        if (next.status === AudioPlayerStatus.Idle) finish();
      };
      const onError = (error: Error) => finish(error);
      const timer = setTimeout(() => {
        this.player.stop(true);
        finish(new Error('Playback timed out'));
      }, PLAYBACK_TIMEOUT_MS);

      this.player.on('stateChange', onStateChange);
      this.player.on('error', onError);
      this.player.play(resource);
    });
  }
}
