"use strict";

import * as Stream from 'stream';
import { Polly } from './polly.js';
import logger from './logger.js';
const sprintf = require('sprintf-js').sprintf;

class AnnouncementManager {
    constructor(voiceId, userVoices, userAlerts, langCode, enterAlert, exitAlert) 
    {
        this.userVoices = userVoices;
        this.voiceId = voiceId;
        this.languageCode = langCode;
        this.userAlerts = userAlerts;
        this.enterAlert = enterAlert.replace('%name', '%1$s');
        this.exitAlert = exitAlert.replace('%name', '%1$s');
        this.formatUserAlerts();
    }
   
    formatUserAlerts() {
        if (!this.userAlerts) return;

        Object.keys(this.userAlerts).map(v => {
            if (this.userAlerts[v].enter) {
                this.userAlerts[v].enter = this.userAlerts[v].enter.replace('%name', '%1$s');
            }

            if (this.userAlerts[v].exit) {
                this.userAlerts[v].exit = this.userAlerts[v].exit.replace('%name', '%1$s');
            }
        });
    }

    updateVoiceId(voiceId, langCode) {
        this.voiceId = voiceId;
        this.languageCode = langCode;
    }

    updateUserVoices(userVoices) {
        if (!userVoices) {
            logger.debug('Null value passed to updateUserVoices - skipping');
            return;
        }

        this.userVoices = userVoices;
    }

    updateUserVoiceId(userId, voiceId, langCode) {
        if (!this.userVoices[userId]) {
            this.userVoices[userId] = { voiceId: null, langCode: null };
        }

        this.userVoices[userId].voice = voiceId;
        this.userVoices[userId].langCode = langCode;
    }
   
    updateUserAlerts(alerts) {
        if (!alerts) {
            logger.debug('Null value passed to updateUserAlerts - skipping');
            return;
        }

        this.userAlerts = alerts;
    }

    updateUserEnterAlert(userId, format) {
        if (!this.userAlerts[userId]) {
            this.userAlerts[userId] = { enter: null, exit: null };
        }

        this.userAlerts[userId].enter = format.replace('%name', '%1$s');
    }

    updateUserExitAlert(userId, format) {
        if (!this.userAlerts[userId]) {
            this.userAlerts[userId] = { enter: null, exit: null };
        }

        this.userAlerts[userId].exit = format.replace('%name', '%1$s');
    }

    updateEnterAlert(format) {
        this.enterAlert = format.replace('%name', '%1$s');
    }
    
    updateExitAlert(format) {
        this.exitAlert = format.replace('%name', '%1$s');
    }
    
    async createAnnouncement(username, userId, channel, entered) {
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            } else {
                this.getSpeechStream(username, userId, channel, entered).then(buffer => {
                    const announcement = {
                        username: username,
                        channel: channel,
                        entered: entered,
                        stream: buffer
                    };
                    
                    resolve(announcement);
                }, err => {
                    reject(err);
                });
            }
        });
    }
    
    createPollyParams(username, userId, entered) {
        const enterAlert = this.userAlerts[userId] && this.userAlerts[userId].enter ? this.userAlerts[userId].enter : this.enterAlert;
        const exitAlert = this.userAlerts[userId] && this.userAlerts[userId].exit ? this.userAlerts[userId].exit : this.exitAlert;
        const langCode = this.userVoices[userId] ? this.userVoices[userId].langCode : this.languageCode;
        const voiceId = this.userVoices[userId] ? this.userVoices[userId].voice : this.voiceId;
        logger.debug('Enter alert: ' + enterAlert);
        const text = sprintf((entered ? enterAlert : exitAlert), username);
        
        let params = {
            'LanguageCode': langCode,
            'Text': text,
            'OutputFormat': 'mp3',
            'VoiceId': voiceId
        };
        
        return params;
    }
    
    getSpeechStream(username, userId, channel, entered) {
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            }
            
            const params = this.createPollyParams(username, userId, entered);
            Polly.synthesizeSpeech(params, this.onSpeechSynthesized.bind(this, resolve, reject));
        });
    }
    
    onSpeechSynthesized(resolve, reject, err, data) {
        if (err) {
            logger.error('on synth error: ' + err.code);
            reject(err);
        } else if (data) {
            if (data.AudioStream instanceof Buffer) {
                let stream = new Stream.PassThrough();
                stream.end(data.AudioStream);
                resolve(stream);
            }
        }
    }
}

export default AnnouncementManager;
