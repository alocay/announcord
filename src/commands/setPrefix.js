import bot from '../bot.js';
const { defaultSettings, hardCodedPrefix } = require('../config.json');

function setPrefixCharacter(message, prefixArg) {
    if (prefixArg === null || 
        prefixArg === undefined ||
        prefixArg.length === 0 ||
        prefixArg[0] === null || 
        prefixArg[0] === undefined ||
        prefixArg[0].length <= 0) {
        message.reply('You must provide a character(s) when setting the command prefix for Announcord');
        return;
    }
    
    if (prefixArg[0] === hardCodedPrefix) {
        message.reply(`Please provide a prefix different than the hardcoded prefix ${hardCodedPrefix}`);
        return;
    }
    
    const guild = message.guild;
    bot.settings.ensure(guild.id, defaultSettings);
    bot.settings.setProp(guild.id, 'prefix', prefixArg[0]);
    
    message.reply('Command prefix now set to `' + bot.settings.getProp(guild.id, 'prefix') + '` for Announcord');
}

export default [
    {
        name: 'prefix',
        description: 'Sets the command prefix (default is !)',
        usage: 'prefix <characters>',
        action: setPrefixCharacter
    }
];