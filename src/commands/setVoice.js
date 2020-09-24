import { voices } from '../polly.js';
import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';
import { findMember } from '../utils.js';

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
        if (voiceIdArgs.length > 1) {
            const userId = voiceIdArgs[1].toLowerCase();
            _setUserVoiceId(userId, voice, message);
        } else {
            _setDefaultVoiceId(voice, message);
        }
    } else {
        message.reply('No matching voice found for `' + voiceId + '`. Use the `showVoices` command to see all available voices.');
    }
}

function _setUserVoiceId(userId, voice, message) {
    const { id, name } = findMember(userId, message.guild.members.cache);

    if (!id) {
        message.reply('No matching user found for `' + userId + '`.');
        return;
    }

    logger.debug('Found user ' + name + ' ' + id);
    const settings = bot.settings.ensure(message.guild.id, defaultSettings);
   

    if (!settings.userVoices[id]) {
        settings.userVoices[id] = {};
    }

    settings.userVoices[id].voice = voice.Id;
    settings.userVoices[id].language = voice.LanguageName;
    settings.userVoices[id].languageCode = voice.LanguageCode;
    bot.settings.setProp(message.guild.id, 'userVoices', settings.userVoices);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserVoiceId(id, voice.Id, voice.LanguageCode);
    }
    
    message.reply('`' + name + '` voice set to `' + voice.Id + '` for `' + voice.LanguageName + '(' + voice.LanguageCode + ')`.');
}

function _setDefaultVoiceId(voice, message) {
    bot.settings.ensure(message.guild.id, defaultSettings);
    bot.settings.setProp(message.guild.id, 'voice', voice.Id);
    bot.settings.setProp(message.guild.id, 'language', voice.LanguageName);
    bot.settings.setProp(message.guild.id, 'languageCode', voice.LanguageCode);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateVoiceId(voice.Id, voice.LanguageCode);
    }
    
    message.reply('Voice set to `' + voice.Id + '` for `' + voice.LanguageName + '(' + voice.LanguageCode + ')`.');
}

export default [
    {
        name: 'voice',
        description: 'Sets the default voice to the voice matching the given name. Use the `showVoices` command for a list of available voices.',
        usage: 'voice <voice name>',
        action: setVoiceId
    },
    {
        name: 'voice',
        description: 'Sets the voice for the specified user (will override the default voice for this user). Use the `showVoices` command for a lsit of available voices.',
        usage: 'voice <voice name> <member name>',
        action: setVoiceId
    }
];
