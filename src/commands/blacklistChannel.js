import bot from '../bot.js';
import { findChannel } from '../util.js';
import logger from '../logger.js';
import { removeChannelFromWhitelist } from './whitelistChannel.js';
import { updateWhiteAndBlacklist } from './unlistChannel.js';

const { defaultSettings } = require('../config.json');

function blacklistChannel(message, args) {
    if (args === null ||
        args === undefined ||
        args.length === 0 ||
        args[0] === null) {
        message.reply('Cannot blacklist, no channel provided.');
        return;
    }
    
    const channelToList = args.join(' ').trim().toLowerCase();
    const channel = findChannel(message.guild, channelToList);
    
    if (!channel) {
        message.reply(`Cannot blacklist - channel '${channelToList}' is not a valid channel name or ID.`);
        return;
    }
    
    if (isChannelBlacklisted(message.guild, channel.id)) {
        message.reply(`Channel '${channel.name}' is already blacklisted.`);
        return;
    }
    
    removeChannelFromWhitelist(message.guild, channel.id);
 
    addChannelToBlacklist(message.guild, channel.id);
    updateWhiteAndBlacklist(message.guild.id);
    
    message.reply(`Channel '${channel.name}' has been blacklisted.`);
}


function isChannelBlacklisted(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);    
    return guildConfig.blacklist.findIndex(id => id === channelId) > -1;
}

function removeChannelFromBlacklist(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    let blacklist = guildConfig.blacklist;
    
    const channelIndex = blacklist.findIndex(id => id === channelId);
    if (channelIndex > -1) {
        blacklist.splice(channelIndex, 1);
    }
    
    bot.settings.setProp(guild.id, 'blacklist', blacklist);
}

function addChannelToBlacklist(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    let blacklist = guildConfig.blacklist;
    blacklist.push(channelId);
    
    bot.settings.setProp(guild.id, 'blacklist', blacklist);
}

export { addChannelToBlacklist, removeChannelFromBlacklist, isChannelBlacklisted };

export default [
    {
        name: 'blacklist',
        description: 'Puts the given channel on a blacklist. These channels will be ignored for annoucing. Can give either a channel name or ID.',
        usage: 'blacklist <channel>',
        action: blacklistChannel
    }
];