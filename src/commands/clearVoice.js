import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';
import { findMember } from '../utils.js';

const { defaultSettings } = require('../config.json');

function clearVoice(message, clearVoiceArgs) {
    if (!clearVoiceArgs || 
        !clearVoiceArgs.length || 
        !clearVoiceArgs[0]) {
        _clearUserVoices(message);
        return;
    }

    const user = clearVoiceArgs[0].toLowerCase();
    _removeUserVoice(user, message);
}

function _clearUserVoices(message) {
    bot.settings.setProp(message.guild.id, 'userVoices', {});
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserVoices(bot.settings.userVoices);
    }
    
    message.reply('All member voices have been cleared.');
}

function _removeUserVoice(userId, message) {
    const { id, name } = findMember(userId, mesage.guild.members.cache);
    
    if (!id) {
        message.reply('No matching user found for `' + userId + '`.');
        return;
    }

    logger.debug('Found user ' + name + ' ' + id); 
    const settings = bot.settings.ensure(message.guild.id, defaultSettings);

    if (!settings.userVoices[id]) {
        message.reply('No voice found for `' + name + '`.');
        return;
    }

    logger.debug('Removing voice for ' + name);
    delete settings.userVoices[id];
    bot.settings.setProp(message.guild.id, 'userVoices', settings.userVoices);

    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserVoices(bot.settings.userVoices);
    }
    
    message.reply('Voice for `' + name + '` has been cleared.');
}

export default [
    {
        name: 'clearVoice',
        description: 'Clear a specific members set voice or all user specific voices if no member name is provided. This has no affect on the default voice.',
        usage: 'clearVoice <name (optional)>',
        action: clearVoice
    }
];
