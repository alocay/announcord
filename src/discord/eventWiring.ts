import { Events, type Client } from 'discord.js';
import type { AnnouncerRegistry } from '../announce/announcerRegistry.js';
import { decideAnnouncements } from '../announce/policy.js';
import type { Logger } from '../logger.js';
import type { SettingsStore } from '../settings/settingsStore.js';
import { routeVoiceChange, type RawVoiceChange } from './voiceEventRouter.js';

// The slices of discord.js objects this module reads. Declaring them
// structurally keeps the handlers testable with plain objects.
export interface MemberLike {
  id: string;
  nickname: string | null;
  user: { bot: boolean; username: string; globalName: string | null };
}

export interface GuildLike {
  id: string;
  afkChannelId: string | null;
  channels: {
    cache: { get(id: string): { members: { values(): Iterable<MemberLike> } } | undefined };
  };
  members: { me: { id: string; voice: { channelId: string | null } } | null };
}

export interface VoiceStateLike {
  guild: GuildLike;
  member: MemberLike | null;
  channelId: string | null;
}

export interface EventDeps {
  store: SettingsStore;
  registry: AnnouncerRegistry;
  /** Whether speech is available to the guild at all. */
  isEnabled(guildId: string): boolean;
  log: Logger;
}

export function toRawVoiceChange(
  oldState: VoiceStateLike,
  newState: VoiceStateLike,
): RawVoiceChange | null {
  const member = newState.member ?? oldState.member;
  if (!member) return null;

  return {
    guildId: newState.guild.id,
    userId: member.id,
    isBot: member.user.bot,
    names: [member.nickname, member.user.globalName, member.user.username].filter(
      (name): name is string => Boolean(name),
    ),
    oldChannelId: oldState.channelId,
    newChannelId: newState.channelId,
    afkChannelId: newState.guild.afkChannelId,
  };
}

function otherHumansIn(guild: GuildLike, channelId: string, exceptUserId: string): number {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return 0;
  let count = 0;
  for (const member of channel.members.values()) {
    if (!member.user.bot && member.id !== exceptUserId) count++;
  }
  return count;
}

export async function handleVoiceStateUpdate(
  oldState: VoiceStateLike,
  newState: VoiceStateLike,
  deps: EventDeps,
): Promise<void> {
  const guild = newState.guild;
  const me = guild.members.me;

  // The bot itself was disconnected (kicked, or its channel was deleted):
  // whatever was queued for that connection is no longer worth playing.
  const subject = newState.member ?? oldState.member;
  if (subject && me && subject.id === me.id) {
    if (newState.channelId === null) deps.registry.peek(guild.id)?.reset();
    return;
  }

  if (!deps.isEnabled(guild.id)) return;

  const raw = toRawVoiceChange(oldState, newState);
  const event = raw && routeVoiceChange(raw);
  if (!event) return;

  const [settings, override, rules] = await Promise.all([
    deps.store.getGuild(guild.id),
    deps.store.getOverride(guild.id, event.userId),
    deps.store.getRules(guild.id),
  ]);

  const announcements = decideAnnouncements({
    event,
    settings,
    override,
    rules,
    otherHumansIn: (channelId) => otherHumansIn(guild, channelId, event.userId),
    botChannelId: me?.voice.channelId ?? null,
  });

  for (const announcement of announcements) {
    deps.registry.get(guild.id).enqueue(announcement);
  }
}

/**
 * The bot lost a guild. Discord sends the same event when a guild is merely
 * unreachable during an outage, so settings are only dropped when the guild is
 * still available, which means the bot was actually removed from it.
 */
export async function handleGuildDelete(
  guild: { id: string; available: boolean },
  deps: EventDeps,
): Promise<void> {
  deps.registry.delete(guild.id);
  if (guild.available) await deps.store.deleteGuild(guild.id);
}

export function wireEvents(client: Client, deps: EventDeps): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // discord.js VoiceState carries everything VoiceStateLike asks for; its
    // channel union is too wide for TypeScript to see that structurally.
    handleVoiceStateUpdate(
      oldState as unknown as VoiceStateLike,
      newState as unknown as VoiceStateLike,
      deps,
    ).catch((error: unknown) => deps.log.error({ err: error }, 'voice state update failed'));
  });

  client.on(Events.GuildDelete, (guild) => {
    handleGuildDelete(guild, deps).catch((error: unknown) =>
      deps.log.error({ err: error, guildId: guild.id }, 'guild cleanup failed'),
    );
  });
}
