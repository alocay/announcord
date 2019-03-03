import bot from '../bot.js';
import { findChannel } from '../util.js';
import logger from '../logger.js';
import { removeChannelFromBlacklist } from './blacklistChannel.js';
import { updateWhiteAndBlacklist } from './unlistChannel.js';

const { defaultSettings } = require('../config.json');

function whitelistChannel(message, args) {
    if (args === null ||
        args === undefined ||
        args.length === 0 ||
        args[0] === null) {
        message.reply('Cannot whitelist, no channel provided.');
        return;
    }
    
    const channelToList = args.join(' ').trim().toLowerCase();
    const channel = findChannel(message.guild, channelToList);
    
    if (!channel) {
        message.reply(`Cannot whitelist - channel '${channelToList}' is not a valid channel name or ID.`);
        return;
    }
    
    if (isChannelWhitelisted(message.guild, channel.id)) {
        message.reply(`Channel '${channel.name}' is already whitelisted.`);
        return;
    }
    
    removeChannelFromBlacklist(message.guild, channel.id);
 
    addChannelToWhitelist(message.guild, channel.id);
    updateWhiteAndBlacklist(message.guild.id);
    
    message.reply(`Channel '${channel.name}' has been whitelisted.`);
}

function isChannelWhitelisted(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);    
    return guildConfig.whitelist.findIndex(id => id === channelId) > -1;
}

function removeChannelFromWhitelist(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    let whitelist = guildConfig.whitelist;
    
    const channelIndex = whitelist.findIndex(id => id === channelId);
    if (channelIndex > -1) {
        whitelist.splice(channelIndex, 1);
    }
    
    bot.settings.setProp(guild.id, 'whitelist', whitelist);
}

function addChannelToWhitelist(guild, channelId) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    let whitelist = guildConfig.whitelist;
    whitelist.push(channelId);
    
    bot.settings.setProp(guild.id, 'whitelist', whitelist);
}

export { addChannelToWhitelist, removeChannelFromWhitelist, isChannelWhitelisted };

export default [
    {
        name: 'whitelist',
        description: 'Puts the given channel on a whitelist. If the whitelist has any channel listed, only these channels will annouced in. Can give either a channel name or ID.',
        usage: 'whitelist <channel>',
        action: whitelistChannel
    }
];