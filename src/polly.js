import Discord from 'discord.js';
import * as AWS from 'aws-sdk';
import logger from './logger.js';

const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-east-1'
});

const voices = new Discord.Collection();
const languageCodes = [];

function loadAvailableVoicesAndLangCodes() {
    const cacheVoicesAndLangCodes = function cacheVoicesAndLangCodes(err, data) {
        
        if (err) {
            logger.error(err.message);
            return;
        }
        
        logger.debug(`Number of voices: ${data.Voices.length}`);
        
        if (!data.Voices) { 
            logger.error('No voices returned from Polly');
            return;
        }
        
        for(let i = 0; i < data.Voices.length; i++) {
            const voice = data.Voices[i];
            // const key = `${voice.LanguageName} (${voice.LanguageCode})`;
            const key = voice.LanguageCode;
            if (voices.has(key)) {
                voices.get(key).push(voice);
            } else {
                voices.set(key, [voice]);
            }
            
            if (!languageCodes.includes(voice.LanguageCode.toLowerCase())) {
                languageCodes.push(voice.LanguageCode.toLowerCase());
            }
        }
        
        logger.debug('Voices and codes loaded');
    };
    
    Polly.describeVoices({}, cacheVoicesAndLangCodes);
}

loadAvailableVoicesAndLangCodes();

export { Polly, voices };