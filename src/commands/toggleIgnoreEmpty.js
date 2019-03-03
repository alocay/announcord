import Enmap from 'enmap';
import bot from '../bot.js';
import announcers from '../announcers.js';
const { defaultSettings } = require('../config.json');

function setIgnoreEmpty(message) {
    updateIgnoreEmpty(message, true);
}

function setIncludeEmpty(message) {
    updateIgnoreEmpty(message, false);
}

function updateIgnoreEmpty(message, shouldIgnore) {
    const guild = message.guild;
    bot.settings.ensure(guild.id, defaultSettings);
    bot.settings.setProp(guild.id, 'ignoreEmpty', shouldIgnore);
    
    const announcer = announcers.get(guild.id);
    
    if (announcer) {
        announcer.updateIgnoreEmpty(shouldIgnore);
    }
    
    let replyMsg = shouldIgnore ? 'Announcord now ignoring empty channels' : 'Announcord now annoucing in all channels';
    message.reply(replyMsg);
}

export default [
    {
        name: 'ignoreEmpty',
        description: 'Sets to ignore announcing in empty channels',
        usage: 'ignoreEmpty',
        action: setIgnoreEmpty
    },
    {
        name: 'includeEmpty',
        description: 'Sets to include empty channels when annoucing',
        usage: 'includeEmpty',
        action: setIncludeEmpty
    }
];