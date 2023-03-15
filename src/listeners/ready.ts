import { ChannelType, Client } from "discord.js";
import BotSettings from "../settings/settings";
import { defaultSettings } from "../config.json";
import { VoiceCache } from "../speech";
import { GuildSettings } from "src/interfaces/guildSettings";
import loggerModule from "../logger";
import { VoiceConnectionManager } from "../audio/voiceConnectionManager";

const logger = loggerModule(__filename);

export function readyListener(client: Client): void {
    client.on("ready", async () => {
        if (!client.user || !client.application) {
            logger.error('No client user or app');
            return;
        }

        client.guilds.cache.forEach(async guild => {
            const settings: GuildSettings = BotSettings.settings.ensure(guild.id, defaultSettings);
            BotSettings.checkAndUpdateConfig(guild.id, settings);

            console.log(guild.name);
            console.log(settings);

            if (!settings.announcementChannelId) {
                const channels = await guild.channels.fetch();
                const c = channels.find((c) => c?.type === ChannelType.GuildVoice);
                settings.announcementChannelId = c?.id;
                BotSettings.settings.set(guild.id, settings);
            }
        });

        VoiceCache.init();
        VoiceConnectionManager.init();

        logger.info(`${client.user.username} is online`);
    });
};