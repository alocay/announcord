import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PollyClient } from '@aws-sdk/client-polly';
import { ChannelType, Client, Events, GatewayIntentBits, type Guild } from 'discord.js';
import { AnnouncerRegistry } from './announce/announcerRegistry.js';
import { GuildAnnouncer } from './announce/guildAnnouncer.js';
import { handleInteraction } from './commands/dispatcher.js';
import { ConfigError, loadConfig } from './config.js';
import { wireEvents } from './discord/eventWiring.js';
import { DiscordVoiceTransport, joinProblem } from './discord/voiceTransport.js';
import { createLogger } from './logger.js';
import { migrate, openDatabase } from './settings/db.js';
import { SettingsStore } from './settings/settingsStore.js';
import { ClipCache } from './tts/clipCache.js';
import { PollyProvider } from './tts/pollyProvider.js';
import { TtsService } from './tts/ttsService.js';
import { UsageMeter } from './tts/usageMeter.js';

const MAX_WARNINGS = 10;

/** Voice channels the bot lacks permission to speak in. */
function joinWarnings(guild: Guild): string[] {
  const warnings: string[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    const problem = joinProblem(guild, channel.id);
    // A full channel is a passing condition, not a configuration problem.
    if (problem && problem !== 'channel is full') warnings.push(`${channel.name}: ${problem}`);
    if (warnings.length === MAX_WARNINGS) break;
  }
  return warnings;
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const log = createLogger(config.logLevel);

  await mkdir(config.dataDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'announcord.sqlite'));
  await migrate(db);

  const cache = new ClipCache(join(config.dataDir, 'cache'), config.cacheMaxMb * 1024 * 1024);
  await cache.init();

  const provider = new PollyProvider(new PollyClient({ region: config.awsRegion }));
  // Fail now, with a clear error, if the AWS credentials are wrong.
  const voices = await provider.listVoices();
  log.info({ voices: voices.length, region: config.awsRegion }, 'polly ready');

  const store = new SettingsStore(db);
  const meter = new UsageMeter(db);
  const tts = new TtsService({ provider, cache, meter, unlimited: config.unlimitedGuildIds });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const registry: AnnouncerRegistry = new AnnouncerRegistry((guildId) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error(`Guild ${guildId} is not available`);

    const guildLog = log.child({ guildId });
    const transport = new DiscordVoiceTransport(guild, guildLog, () =>
      registry.peek(guildId)?.reset(),
    );
    return new GuildAnnouncer({
      transport,
      // The guild voice is the fallback if a member's chosen voice was retired.
      getClip: async (a) =>
        tts.getClip(a.guildId, a.text, a.voiceId, (await store.getGuild(a.guildId)).voiceId),
      idleMs: config.idleLeaveSeconds * 1000,
      log: guildLog,
    });
  });

  wireEvents(client, { store, registry, isEnabled: (id) => tts.isEnabledFor(id), log });
  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction, { store, meter, tts, registry, joinWarnings, log });
  });
  client.once(Events.ClientReady, (ready) => {
    log.info(
      { user: ready.user.tag, guilds: ready.guilds.cache.size, speechEnabledFor: config.unlimitedGuildIds.size },
      'announcord ready',
    );
  });
  client.on(Events.Error, (error) => log.error({ err: error }, 'discord client error'));

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down');
    registry.shutdownAll();
    await client.destroy();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => log.error({ err: reason }, 'unhandled rejection'));

  await client.login(config.discordToken);
}

main().catch((error: unknown) => {
  // The logger may not exist yet (bad config), so report on stderr directly.
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error('Announcord failed to start:', error);
  }
  process.exit(1);
});
