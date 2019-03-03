import Enmap from 'enmap';
import bot from '../bot.js';
import announcers from '../announcers.js';
const { defaultSettings } = require('../config.json');

function setAnnounceStyle(message, args) {
    if (args === null ||
        args === undefined ||
        args.length === 0 ||
        args[0] === null) {
        message.reply('Unknown announcement style option. Valid options are `join`, `exit`, and `both`');
        return;
    }
    
    const style = args[0].toLowerCase();
    
    if (style !== 'both' &&
        style !== 'join' &&
        style !== 'exit') {
        message.reply('Unknown announcement style option. Valid options are `join`, `exit`, and `both`');
        return;
    }
    
    const guild = message.guild;
    bot.settings.ensure(guild.id, defaultSettings);
    bot.settings.setProp(guild.id, 'announce', style);
    
    const announcer = announcers.get(guild.id);
    
    if (announcer) {
        announcer.updateAnnouncementStyle(style);
    }
    
    message.reply('The announcement style has been set to `' + bot.settings.getProp(guild.id, 'announce') + '`');
}

export default [
    {
        name: 'style',
        description: 'Sets whether to announce joins, exits, or both (defaults to both)',
        usage: 'style <join|exit|both>',
        action: setAnnounceStyle
    }
];