import BotSettings from "../settings/settings";
import loggerModule from "../logger";
import { Voice } from "@aws-sdk/client-polly";
import { GuildSettings, UserAlerts, UserVoices } from "src/interfaces/guildSettings";
import settingsKeys from "./settingsKeys";
import UserVoice from "../interfaces/userVoice";
import UserAlert from "../interfaces/userAlert";

const logger = loggerModule(__filename);
const NEURAL_ENGINE = "neural";
const STANDARD_ENGINE = "standard";

export default class SettingsManager {
    static update(guildId: string | undefined, key: string, value: any) {
        SettingsManager.assertId(guildId, `Cannot update setting ${key} - No guild ID given`);

        logger.debug("Updating settings...");

        const settings = BotSettings.settings.get(guildId);
        settings[key] = value;
        BotSettings.settings.set(guildId, settings);
        const s =  BotSettings.settings.get(guildId);
    }

    static updateUserVoice(guildId: string | undefined, userId: string | undefined, voice: Voice) {
        SettingsManager.assertId(guildId, `Cannot update user voice for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot update user voice - no user ID given");

        const settings: GuildSettings = BotSettings.settings.get(guildId);
        const userVoices: UserVoices = settings.userVoices;
        const engine = voice.SupportedEngines?.includes(NEURAL_ENGINE) ? NEURAL_ENGINE : STANDARD_ENGINE;
        userVoices[userId] = { voice: voice.Name, languageCode: voice.LanguageCode, engine };
        SettingsManager.update(guildId, settingsKeys.USER_VOICES, userVoices);
    }

    static updateUserEnterAlert(guildId: string | undefined, userId: string | undefined, enterAlert: string) {
        SettingsManager.assertId(guildId, `Cannot update user enter alert for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot update user enter alert - no user ID given");


        const settings: GuildSettings = BotSettings.settings.get(guildId);
        const userAlerts: UserAlerts = settings.userAlerts;
        userAlerts[userId] = { enterAlertFormat: enterAlert, exitAlertFormat: userAlerts[userId]?.exitAlertFormat };
        SettingsManager.update(guildId, settingsKeys.USER_ALERTS, userAlerts);
    }

    static updateUserExitAlert(guildId: string | undefined, userId: string | undefined, exitAlert: string) {
        SettingsManager.assertId(guildId, `Cannot update user exit alert for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot update user exit alert - no user ID given");

        const settings: GuildSettings = BotSettings.settings.get(guildId || "");
        const userAlerts: UserAlerts = settings.userAlerts;
        userAlerts[userId] = { enterAlertFormat: userAlerts[userId]?.enterAlertFormat, exitAlertFormat: exitAlert };
        SettingsManager.update(guildId, settingsKeys.USER_ALERTS, userAlerts);
    }

    static toggleSneak(guildId: string | undefined, userId: string | undefined): boolean {
        SettingsManager.assertId(userId, `Cannot get toggle sneak - No user ID given`);
        SettingsManager.assertId(guildId, `Cannot get toggle sneak for user ${userId} - No guild ID given`);

        const settings = BotSettings.settings.get(guildId);
        const sneakSettings = settings.userSneak;
        if (!sneakSettings[userId]) {
            sneakSettings[userId] = true;
        } else {
            const currentSettings: boolean = sneakSettings[userId];
            sneakSettings[userId] = !currentSettings;
        }

        SettingsManager.update(guildId, settingsKeys.USER_SNEAK, sneakSettings);
        return sneakSettings[userId];
    }

    static toggleValue(guildId: string | undefined, key: string | undefined): boolean {
        SettingsManager.assertId(key, `Cannot get toggle setting - No key given`);
        SettingsManager.assertId(guildId, `Cannot get toggle setting ${key} - No guild ID given`);

        const settings = BotSettings.settings.get(guildId);
        const value = settings[key];
        if (!value) {
            settings[key] = true;
        } else {
            settings[key] = !settings[key];
        }

        BotSettings.settings.set(guildId, settings);
        return settings[key];
    }

    static get(guildId: string | undefined, key: string): any {
        SettingsManager.assertId(guildId, `Cannot get value for ${key} - No guild ID given`);

        const settings = BotSettings.settings.get(guildId);
        return settings[key];
    }

    static getUserVoiceEngine(guildId: string | undefined, userId: string | undefined): string | undefined | null {
        SettingsManager.assertId(guildId, `Cannot get user voice engine for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot get user voice engine - no user ID given");

        const userVoices: UserVoices = SettingsManager.get(guildId, settingsKeys.USER_VOICES);
        return userVoices[userId]?.engine;
    }

    static getUserVoice(guildId: string | undefined, userId: string | undefined): UserVoice {
        SettingsManager.assertId(guildId, `Cannot get user voice for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot get user voice - no user ID given");

        const userVoices: UserVoices = SettingsManager.get(guildId, settingsKeys.USER_VOICES);
        return userVoices[userId];
    }

    static getUserAlert(guildId: string | undefined, userId: string | undefined): UserAlert | undefined {
        SettingsManager.assertId(guildId, `Cannot get user enter alert for ${userId} - No guild ID given`);
        SettingsManager.assertId(userId, "Cannot get user enter alert - no user ID given");

        const userAlerts: UserAlerts = SettingsManager.get(guildId, settingsKeys.USER_ALERTS);
        return userId in userAlerts ? userAlerts[userId] : undefined;
    }

    static getUserEnterAlert(guildId: string | undefined, userId: string | undefined): string | undefined | null {
        const userAlert = SettingsManager.getUserAlert(guildId, userId);
        return userAlert?.enterAlertFormat;
    }

    static getUserExitAlert(guildId: string | undefined, userId: string | undefined): string | undefined | null {
        const userAlert = SettingsManager.getUserAlert(guildId, userId);
        return userAlert?.exitAlertFormat;
    }

    private static assertId(id: string | undefined, msg: string): asserts id is string {
        if (!id) {
            logger.error(msg);
            throw new Error(msg);
        }
    }
}