'use strict';

import Discord from 'discord.js';
import Enmap from 'enmap';
import Announcer from './announcer.js';

const { defaultSettings, token, hardCodedPrefix } = require('./config.json');

const bot = new Discord.Client();
const announcers = new Discord.Collection();

bot.settings = new Enmap({
    name: 'settings',
    fetchAll: false,
    autoFetch: true,
    cloneLevel: 'deep'
});

const commands = new Discord.Collection([
    ['setPrefixCmd', {
        name: 'prefix',
        description: 'Sets the command prefix (default is !)',
        usage: 'prefix <characters>',
        action: setPrefixCharacter
    }],
    ['announceCmd', {
        name: 'announce-style',
        description: 'Sets whether to announce joins, exits, or both (defaults to both)',
        usage: 'announce-style <join|exit|both>',
        action: setAnnounceStyle
    }],
    ['ignoreEmptyCmd', {
        name: 'ignoreEmpty',
        description: 'Sets to ignore announcing in empty channels',
        usage: 'ignoreEmpty',
        action: setIgnoreEmpty
    }],
    ['includeEmpty', {
        name: 'includeEmpty',
        description: 'Sets to include empty channels when annoucing',
        usage: 'includeEmpty',
        action: setIncludeEmpty
    }],
    ['viewSettingsCmd', {
        name: 'settings',
        description: 'Displays the current configuration',
        usage: 'settings',
        action: displayGuildConfig,
        public: true
    }],
    ['resetConfig', {
        name: 'resetconfig',
        description: 'Resets the configuration to default',
        usage: 'resetconfig',
        action: resetGuildConfig
    }],
    ['helpCmd', {
        name: 'help',
        description: 'Display help info for Announcord',
        usage: `help`,
        action: displayHelp,
        public: true
    }]
]);

bot.on('ready', () => {
    console.log('Ready');
    
    bot.guilds.forEach((guild) => {
        const settings = bot.settings.ensure(guild.id, defaultSettings);
        announcers.set(guild.id, new Announcer(guild, settings.announce, settings.ignoreEmpty));
    });
});

bot.on('guildCreate', guild => {
    bot.settings.ensure(guild.id, defaultSettings);
    announcers.set(guild.id, new Announcer(guild, settings.announce, settings.ignoreEmpty));
});

bot.on('guildDelete', guild => {
    announcers.delete(guild.id);
    bot.settings.ensure(guild.id);
});

bot.on('voiceStateUpdate', (oldMember, newMember) => {
    if (newMember.user.bot) return;
    
    let newUserChannel = newMember.voiceChannel;
    let oldUserChannel = oldMember.voiceChannel;
    const username = newMember.nickname ? newMember.nickname : newMember.user.username;
    const announcer = announcers.get(newMember.guild.id);
    
    if (!announcer) return;
    
    announcer.handleVoiceUpdate(username, oldUserChannel, newUserChannel);
});

bot.on('message', message => {
    if(!message.guild || message.author.bot) return;
    
    const guild = message.guild;
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    let prefixUsed = null;
    
    if(message.content.startsWith(guildConfig.prefix)) {
        prefixUsed = guildConfig.prefix;
    } else if(message.content.startsWith(hardCodedPrefix)) {
        prefixUsed = hardCodedPrefix;
    }
    
    if(!prefixUsed) return;
    
    const commandArgs = message.content.slice(prefixUsed.length).split(/ +/);
    const commandName = commandArgs.shift().toLowerCase();
    
    if (commandName.length < 2) {
        return;
    }
    
    const command = commands.find(c => c.name.startsWith(commandName));    
    if (command) {
        if (!command.public && !message.member.permissions.has('ADMINISTRATOR')) {
            message.reply(`The ${command.name} command can only be run by administrators`);
            return;
        }
        
        command.action(message, commandArgs);
        return;
    }
});

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
    announcer.updateAnnouncementStyle(style);
    
    message.reply('The announcement style has been set to `' + bot.settings.getProp(guild.id, 'announce') + '`');
}

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
    announcer.updateIgnoreEmpty(shouldIgnore);
    
    let replyMsg = shouldIgnore ? 'Announcord now ignoring empty channels' : 'Announcord now annoucing in all channels';
    message.reply(replyMsg);
}

function displayGuildConfig(message) {
    const configEmbed = createEmbedConfigMessage(message.guild);
    message.reply(configEmbed);
}

function resetGuildConfig(message) {
    bot.settings.set(message.guild.id, defaultSettings);
    
    message.reply('The configuration settings have been reset. Use `settings` command to view the current settings.');
}

function displayHelp(message, helpArgs) {
    const guildConfig = bot.settings.ensure(message.guild.id, defaultSettings);
    
    try {   
        const helpEmbed = createEmbedHelpMessage(message.guild);        
        message.author.send(helpEmbed);
        message.reply('A DM has been sent with the help info');
    } catch(e) {
        console.error('Error display help', e);
    }
}

function createEmbedHelpMessage(guild) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    
    const embed = new Discord.RichEmbed()
        .setTitle('Announcord Help Information')
        .setDescription(`**Note:** All commands can be reduced to at least 2 letters. The command prefix ${hardCodedPrefix} will always be available if necessary.`)
        .setFooter(`The bot icon is made by Freepik at http://www.freepik.com`)
        .setTimestamp();
    
    commands.forEach(c => {
        embed.addField(`${guildConfig.prefix}${c.usage}`, c.description);
    });
    
    return embed;
}

function createEmbedConfigMessage(guild) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    
    const embed = new Discord.RichEmbed()
        .setTitle(`Configuration for ${guild.name}`)
        .setTimestamp();
    
    Object.keys(guildConfig).map(prop => {
        embed.addField(prop, guildConfig[prop]);
    });
    
    return embed;
}

process.on('unhandledRejection', error => console.error(`Uncaught Promise Rejection:\n${error}`));

bot.login(token);