import { Client, GuildBasedChannel, GuildMember, VoiceState } from "discord.js";
import AnnouncementManager from "../announcementManager";
import Announcement from "../interfaces/announcement";
import { VoiceConnectionManager } from "../audio/voiceConnectionManager";
import SettingsManager from "../settings/settingsManager";
import settingsKeys from "../settings/settingsKeys";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export function enterExitChannelListener(client: Client): void {
    const announcementManagers: Map<string, AnnouncementManager> = new Map();

    client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
        if (!newState.member || newState.member?.user.bot) {
            logger.debug("No member value or member entering is a bot");
            return;
        }

        const guildId = newState.guild.id;

        if (!SettingsManager.get(guildId, settingsKeys.ENABLED)) {
            logger.info("Skipping announcement, announcord is disabled");
            return;
        }


        const newChannel = await getChannel(newState);
        const oldChannel = await getChannel(oldState);

        if (!newChannel && !oldChannel) {
            logger.error("No new or old channel");
            return;
        }

        if(!announcementManagers.has(guildId)) {
            announcementManagers.set(guildId, new AnnouncementManager(guildId));
        }

        const announcementManager = announcementManagers.get(guildId);
        if (!announcementManager) {
            logger.error(`No announcement manager found for ${newState.guild.name} (${guildId})`)
            return;
        }

        playAnnouncement(
            guildId,
            newChannel,
            oldChannel,
            newState.member,
            announcementManager);
    });
};

async function getChannel(voiceState: VoiceState): Promise<GuildBasedChannel | null> {
    const channelId = voiceState.channelId;
    const guild = voiceState.guild;
    return channelId ? await guild.channels.fetch(channelId) : null;
}

async function playAnnouncement(
    guildId: string,
    newChannel: GuildBasedChannel | null,
    oldChannel: GuildBasedChannel | null,
    member: GuildMember,
    announcementManager: AnnouncementManager) {
    const announcementChannelId = SettingsManager.get(guildId, settingsKeys.ANNOUNCEMENT_CHANNEL_ID);

    if (newChannel && newChannel?.id === announcementChannelId) {
        const announcement: Announcement = await announcementManager.createAnnouncement(member, true);
        VoiceConnectionManager.joinAndPlay(newChannel, announcement.stream);
    } else if (oldChannel && oldChannel?.id === announcementChannelId) {
        const announcement: Announcement = await announcementManager.createAnnouncement(member, false);
        VoiceConnectionManager.joinAndPlay(oldChannel, announcement.stream);
    }
}