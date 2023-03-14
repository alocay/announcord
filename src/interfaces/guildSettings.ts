import UserAlert from "./userAlert";
import UserVoice from "./userVoice";

export type UserVoices = { [k: string]: UserVoice };
export type UserAlerts = { [k: string]: UserAlert };

export interface GuildSettings {
    ignoreEmpty: string;
    voice: string;
    language: string;
    languageCode: string;
    enterAlert: string;
    exitAlert: string;
    version: string;
    userVoices: UserVoices;
    userAlerts: UserAlerts;
    announcementChannelId: string | undefined;
}