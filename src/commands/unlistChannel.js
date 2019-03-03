import bot from '../bot.js';
import { findChannel } from '../util.js';
import logger from '../logger.js';
import announcers from '../announcers.js';
import { isChannelWhitelisted, removeChannelFromWhitelist } from './whitelistChannel.js';
import { isChannelBlacklisted, removeChannelFromBlacklist } from './blacklistChannel.js';

const { defaultSettings } = require('../config.json');

function unlistChannel(message, args) {
    if (args === null ||
        args === undefined ||
        args.length === 0 ||
        args[0] === null) {
        message.reply('Cannot unlist, no channel provided.');
        return;
    }
    
    const guild = message.guild;
    const channelToUnlist = args.join(' ').trim().toLowerCase();
    const channel = findChannel(guild, channelToUnlist);
    
    if (!channel) {
        message.reply(`Cannot unlist - channel '${channelToUnlist}' is not a valid channel name or ID.`);
        return;
    }
    
    const channelId = channel.id;    
    if (isChannelWhitelisted(guild, channelId)) {
        removeChannelFromWhitelist(guild, channelId);
    } else if (isChannelBlacklisted(guild, channelId)) {
        removeChannelFromBlacklist(guild, channelId);
    } else {
        message.reply(`Channel '${channel.name}' is not listed.`);
        return;
    }
    
    updateWhiteAndBlacklist(guild.id);
    message.reply(`Channel '${channel.name}' has been unlisted.`);
}

function updateWhiteAndBlacklist(guildId) {
    const guildConfig = bot.settings.ensure(guildId, defaultSettings);
    const announcer = announcers.get(guildId);
    
    if (announcer) {
        announcer.updateWhitelist(guildConfig.whitelist);
        announcer.updateBlacklist(guildConfig.blacklist);
    }
}

export { updateWhiteAndBlacklist };

export default [
    {
        name: 'unlist',
        description: 'Removes the channel from either the blacklist or whitelist. Can give either a channel name or ID.',
        usage: 'unlist <channel>',
        action: unlistChannel
    }
];