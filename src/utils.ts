import { Voice } from "@aws-sdk/client-polly";
import { Guild } from "discord.js";
import { VoiceCache } from "./speech";
import loggerModule from "./logger";

const logger = loggerModule(__filename);

export default class Utils {
    public static findMemberNameById(id: string, guild: Guild) {
        const mem = guild.members.cache.get(id);

        if (!mem) {
            return null;
        }

        return mem.nickname ? mem.nickname : mem.user.username;
    }

    public static async getChannelName(channelId: string, guild: Guild): Promise<string> {
        let channel = await guild.channels.fetch(channelId);

        if (!channel) {
            return channelId;
        }

        return channel.name;
    }

    public static getVoicesByLanguage(language: string): Voice[] | undefined {
        const allVoices = VoiceCache.voicesByLanguage;
        const languageKey = language?.toLowerCase() || "";

        logger.debug(`Filtering voices with language ${language}`);
        return allVoices.has(languageKey) ? allVoices.get(languageKey) : [];
    }

    public static findVoiceByName(name: string): Voice | null {
        for(let voice of VoiceCache.voices) {
            if (voice.Name?.toLowerCase().includes(name.toLowerCase())) {
                return voice;
            }
        }

        return null;
    }
}