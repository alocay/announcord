"use strict";

import * as AWS from 'aws-sdk';
import * as Stream from 'stream';

const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-east-1'
});

class Announcement {
    constructor() 
    {
    }
    
    static CreateAnnouncement(username, channel, entered) {
        //console.log('create announcement: ' + username);
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            } else {
                Announcement.getSpeechStream(username, channel, entered).then(buffer => {
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
    
    static createPollyParams(username, entered) {
        let params = {
            'LanguageCode': 'en-US',
            'Text': `${username} has ${(entered ? 'entered' : 'left')} the channel`,
            'OutputFormat': 'mp3',
            'VoiceId': 'Matthew'
        };
        
        return params;
    }
    
    static getSpeechStream(username, channel, entered) {
        return new Promise((resolve, reject) => {
            if (!username || !channel) {
                reject(new Error('username and channel required'));
            }
            
            const params = Announcement.createPollyParams(username, entered);
            Polly.synthesizeSpeech(params, Announcement.onSpeechSynthesized.bind(this, resolve, reject));
        });
    }
    
    static onSpeechSynthesized(resolve, reject, err, data) {
        if (err) {
            console.log(err.code);
            reject(err);
        } else if (data) {
            if (data.AudioStream instanceof Buffer) {
                let stream = new Stream.PassThrough();
                stream.end(data.AudioStream);
                //console.log('stream created');
                resolve(stream);
            }
        }
    }
}

export default Announcement;