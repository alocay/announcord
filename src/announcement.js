"use strict";

import * as AWS from 'aws-sdk';
import * as Stream from 'stream';

const sprintf = require('sprintf-js').sprintf;

const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-east-1'
});

class AnnouncementManager {
    constructor(voiceId, langCode, enterAlert, exitAlert) 
    {
        this.voiceId = voiceId;
        this.languageCode = langCode;
        this.enterAlert = enterAlert.replace('%name', '%1$s');
        this.exitAlert = exitAlert.replace('%name', '%1$s');
    }
    
    updateVoiceId(voiceId, langCode) {
        this.voiceId = voiceId;
        this.languageCode = langCode;
    }
    
    updateEnterAlert(format) {
        this.enterAlert = format.replace('%name', '%1$s');
    }
    
    updateExitAlert(format) {
        this.exitAlert = format.replace('%name', '%1$s');
    }
    
    async createAnnouncement(username, channel, entered) {
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            } else {
                this.getSpeechStream(username, channel, entered).then(buffer => {
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
    
    createPollyParams(username, entered) {
        const text = sprintf((entered ? this.enterAlert : this.exitAlert), username);
        let params = {
            'LanguageCode': this.languageCode,
            'Text': text,
            'OutputFormat': 'mp3',
            'VoiceId': this.voiceId
        };
        
        return params;
    }
    
    getSpeechStream(username, channel, entered) {
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            }
            
            const params = this.createPollyParams(username, entered);
            Polly.synthesizeSpeech(params, this.onSpeechSynthesized.bind(this, resolve, reject));
        });
    }
    
    onSpeechSynthesized(resolve, reject, err, data) {
        if (err) {
            console.log(err.code);
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