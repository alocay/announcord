import { GuildSettings } from "./interfaces/guildSettings";

export interface BotConfigInterface {
    token: string;
    hardCodedPrefix: string;
    logLevel: string;
    defaultSettings: GuildSettings;
}