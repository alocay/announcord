import { voices } from '../polly.js';
import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';

const { defaultSettings } = require('../config.json');

function setVoiceId(message, voiceIdArgs) {
    if (voiceIdArgs === null ||
        voiceIdArgs === undefined ||
        voiceIdArgs.length === 0 ||
        voiceIdArgs[0] === null) {
        message.reply('Unknown voice ID option. Use the `showVoices` command to see all available voices.');
        return;
    }
        
    const voiceId = voiceIdArgs[0].toLowerCase();
    
    logger.debug(`Finding voice ID for ${voiceId}...`);
    let voice = null;
    
    voices.forEach((val, key) => {
        const voi = val.find(v => v.Id.toLowerCase().includes(voiceId));
        if (voi) {
            voice = voi;
        }
    });
    
    if (voice) {
        bot.settings.ensure(message.guild.id, defaultSettings);
        bot.settings.setProp(message.guild.id, 'voice', voice.Id);
        bot.settings.setProp(message.guild.id, 'language', voice.LanguageName);
        bot.settings.setProp(message.guild.id, 'languageCode', voice.LanguageCode);
        
        const announcer = announcers.get(message.guild.id);
        if (announcer) {
            announcer.updateVoiceId(voice.Id, voice.LanguageCode);
        }
        
        message.reply('Voice set to `' + voice.Id + '` for `' + voice.LanguageName + '(' + voice.LanguageCode + ')`.');
    } else {
        message.reply('No matching voice found for `' + voiceId + '`. Use the `showVoices` command to see all available voices.');
    }
}

export default [
    {
        name: 'voice',
        description: 'Changes the voice matching the given ID. Use the `showVoices` command for a list of available voices.',
        usage: 'voice <voice ID>',
        action: setVoiceId
    }
];