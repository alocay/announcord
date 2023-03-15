"use strict";

import { sprintf } from 'sprintf-js';
import { PollySpeech } from './speech';
import Announcement from './interfaces/announcement';
import loggerModule from "./logger";
import { GuildMember } from 'discord.js';
import SettingsManager from './settings/settingsManager';
import settingsKeys from './settings/settingsKeys';

const logger = loggerModule(__filename);

export default class AnnouncementManager {
    pollySpeech: PollySpeech;
    guildId: string;

    constructor(guildId: string)
    {
        this.pollySpeech = new PollySpeech();
        this.guildId = guildId;
    }

    async createAnnouncement(member: GuildMember, entered: boolean): Promise<Announcement> {
        const username = member.nickname ? member.nickname : member.user.username;
        const text: string = this.getAlertText(username, member.id, entered);
        const voiceId: string = this.getVoiceId(member.id);
        const langCode: string = this.getLanguageCode(member.id);
        const engine: string = this.getEngine(member.id);
        const stream = await this.pollySpeech.getSpeechStream(text, voiceId, langCode, engine);

        return {
            username,
            entered,
            stream
        }
    }

    getAlertText(username: string, userId: string, entered: boolean): string {
        if (entered) {
            return sprintf(this.reformatAlert(this.getEnterAlert(userId)), username);
        }

        return sprintf(this.reformatAlert(this.getExitAlert(userId)), username);
    }

    getEnterAlert(userId: string): string {
        const userAlert = SettingsManager.getUserEnterAlert(this.guildId, userId);
        return userAlert || SettingsManager.get(this.guildId, settingsKeys.DEFAULT_ENTER_ALERT);
    }

    getExitAlert(userId: string): string {
        const userAlert = SettingsManager.getUserExitAlert(this.guildId, userId);
        return userAlert || SettingsManager.get(this.guildId, settingsKeys.DEFAULT_EXIT_ALERT);
    }

    getLanguageCode(userId: string): string {
        return SettingsManager.get(this.guildId, settingsKeys.LANGUAGE_CODE);
    }

    getVoiceId(userId: string): string {
        logger.debug(`Get voice ID - guildId: ${this.guildId}, userId: ${userId}`);
        const userVoice = SettingsManager.getUserVoice(this.guildId, userId);
        return userVoice?.voice || SettingsManager.get(this.guildId, settingsKeys.VOICE);
    }

    getEngine(userId: string): string {
        logger.debug(`Get engine - guildId: ${this.guildId}, userId: ${userId}`);
        const engine = SettingsManager.getUserVoiceEngine(this.guildId, userId);
        return engine || "standard";
    }

    reformatAlert(format: string): string {
        return format.replace("%name", "%1$s");
    }
}
