'use strict';

import express from 'express';
import * as AWS from 'aws-sdk';
import Discord from 'discord.js';
import Enmap from 'enmap';
import Announcer from './announcer.js';

const app = express();

const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-east-1'
});

const { defaultSettings, token, hardCodedPrefix } = require('./config.json');
const logger = require('./logger.js');

const bot = new Discord.Client();
const announcers = new Discord.Collection();
const voices = new Discord.Collection();
const languageCodes = [];

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
    ['styleCmd', {
        name: 'style',
        description: 'Sets whether to announce joins, exits, or both (defaults to both)',
        usage: 'style <join|exit|both>',
        action: setAnnounceStyle
    }],
    ['ignoreEmptyCmd', {
        name: 'ignoreEmpty',
        description: 'Sets to ignore announcing in empty channels',
        usage: 'ignoreEmpty',
        action: setIgnoreEmpty
    }],
    ['includeEmptyCmd', {
        name: 'includeEmpty',
        description: 'Sets to include empty channels when annoucing',
        usage: 'includeEmpty',
        action: setIncludeEmpty
    }],
    ['showVoicesCmd', {
        name: 'showVoices',
        description: 'Sends a DM containing available voices. If a language or language code is given, will filter out voices for those languages only.',
        usage: 'showVoices <language/code (optional)>',
        action: getVoices
    }],
    ['voiceCmd', {
        name: 'voice',
        description: 'Changes the voice matching the given ID. Use the `showVoices` command for a list of available voices.',
        usage: 'voice <voice ID>',
        action: setVoiceId
    }],
    ['setEnterAlertFormatCmd', {
        name: 'enterAlert',
        description: "Changes the enter alert message format. Use `%name` for the entering user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'enterAlert <format>',
        action: setEnterAlertFormat
    }],
    ['setExitAlertFormatCmd', {
        name: 'exitAlert',
        description: "Changes the exit alert message format. Use `%name` for the exiting user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'exitAlert <format>',
        action: setExitAlertFormat
    }],
    ['viewSettingsCmd', {
        name: 'settings',
        description: 'Displays the current configuration',
        usage: 'settings',
        action: displayGuildConfig,
        public: true
    }],
    ['resetConfigCmd', {
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
    logger.info('Ready');
    
    bot.guilds.forEach((guild) => {
        const settings = bot.settings.ensure(guild.id, defaultSettings);
        announcers.set(
            guild.id, 
            new Announcer(
                guild, 
                settings.announce, 
                settings.ignoreEmpty, 
                settings.voice, 
                settings.languageCode, 
                settings.enterAlert, 
                settings.exitAlert
            )
        );
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

bot.on('voiceStateUpdate', (oldState, newState) => { 
    if (newState.member.user.bot) return;
    
    const voiceStateGuild = bot.guilds.get(newState.guild.id);
    
    let newChannel = newState ? newState.channel : null;
    let oldChannel = oldState ? oldState.channel : null;
    const username = newState.member.nickname ? newState.member.nickname : newState.member.user.username;
    const announcer = announcers.get(newState.guild.id);
    
    if (!announcer) return;
    
    announcer.handleVoiceUpdate(username, newState.id, oldChannel, newChannel, voiceStateGuild.voiceConnection);
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
    
    const command = commands.find(c => c.name.toLowerCase().startsWith(commandName));
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
    
    if (announcer) {
        announcer.updateAnnouncementStyle(style);
    }
    
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

function getVoices(message, langCodeArgs) {
    const langCodeFilter = langCodeArgs && langCodeArgs.length > 0 ? langCodeArgs[0] : null;
    
    message.reply('A DM will be sent with a list of available voices');
    sendVoicesCollection(message.author, langCodeFilter);
}

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

function setEnterAlertFormat(message, alertArgs) {
    logger.debug('Setting enter alert format...');
    
    const alertFormat = verifyAlertFormat(alertArgs);
    
    logger.debug(`Alert format: ${alertFormat}`);
    
    if (!alertFormat) return;
    
    bot.settings.ensure(message.guild.id, defaultSettings);
    bot.settings.setProp(message.guild.id, 'enterAlert', alertFormat);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateEnterAlert(alertFormat);
    }
    
    message.reply('The enter alert has been updated.');
}

function setExitAlertFormat(message, alertArgs) {
    const alertFormat = verifyAlertFormat(alertArgs);
    
    bot.settings.ensure(message.guild.id, defaultSettings);
    bot.settings.setProp(message.guild.id, 'exitAlert', alertFormat);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateExitAlert(alertFormat);
    }
    
    message.reply('The exit alert has been updated.');
}

function verifyAlertFormat(alertArgs) {
    if (alertArgs === null || 
        alertArgs === undefined ||
        alertArgs.length === 0) {
        message.reply('You must provide an alert when setting the alert');
        return null;
    }
    
    const alertFormat = alertArgs.join(' ').trim();
    
    if (!alertFormat || alertFormat === "") {
        message.reply('You must provide an alert when setting the alert');
        return null;
    }
    
    const alertLengthCheck = alertFormat.replace('%name', '');    
    if (alertLengthCheck.length > 150) {
        message.reply('The alert message is too long. Max length is 150 characters not including `%name`');
        return null;
    }
    
    return alertFormat;
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
        logger.error('Error display help', e);
    }
}

function loadAvailableVoicesAndLangCodes() {
    const cacheVoicesAndLangCodes = function cacheVoicesAndLangCodes(err, data) {
        
        if (err) {
            logger.error(err.message);
            return;
        }
        
        logger.debug(`Number of voices: ${data.Voices.length}`);
        
        if (!data.Voices) { 
            logger.error('No voices returned from Polly');
            return;
        }
        
        for(let i = 0; i < data.Voices.length; i++) {
            const voice = data.Voices[i];
            // const key = `${voice.LanguageName} (${voice.LanguageCode})`;
            const key = voice.LanguageCode;
            if (voices.has(key)) {
                voices.get(key).push(voice);
            } else {
                voices.set(key, [voice]);
            }
            
            if (!languageCodes.includes(voice.LanguageCode.toLowerCase())) {
                languageCodes.push(voice.LanguageCode.toLowerCase());
            }
        }
        
        logger.debug('Voices and codes loaded');
    };
    
    Polly.describeVoices({}, cacheVoicesAndLangCodes);
}

function sendVoicesCollection(author, langFilter) {
    if (!author) return;
    
    let filteredVoices = null;
    if (langFilter) {
        logger.debug(`Filtering voices with ${langFilter} - checking language codes first....`);
        filteredVoices = voices.filter(v => v[0].LanguageCode.toLowerCase() === langFilter.toLowerCase());
        
        if (!filteredVoices || filteredVoices.size === 0) {
            logger.debug('No voices filtered - checking language names...');
            filteredVoices = voices.filter(v => v[0].LanguageName.toLowerCase().includes(langFilter.toLowerCase()));
            
            if (!filteredVoices || filteredVoices.size === 0) {
                logger.debug('No voices filtered by language name... displaying all');
            }
        }
        
        logger.debug(`Filtering done - number of filtered voices: ${filteredVoices.size}`);
    }
    
    if (!filteredVoices) {
        filteredVoices = voices;
    }
    
    const embed = new Discord.MessageEmbed()
        .setTitle('Available Voices for Announcord')
        .setDescription('**Note:** Available voices can be found @ https://docs.aws.amazon.com/polly/latest/dg/voicelist.html')
        .setTimestamp();
    
    filteredVoices.forEach((v, k, m) => {
        const field = getLanguageLabelAndVoiceIds(v);
        embed.addField(field.label, field.ids);
    });
    
    author.send(embed);
}

function getLanguageLabelAndVoiceIds(value) {
    const label = `${value[0].LanguageName} (${value[0].LanguageCode})`;
    const voiceIds = value.map(v => v.Id);
    const ids = [voiceIds.slice(0, -1).join(', '), voiceIds.slice(-1)[0]].join(voiceIds.length < 2 ? '' : ', ');
    return { label: label, ids: ids };
}

function createEmbedHelpMessage(guild) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    
    const embed = new Discord.MessageEmbed()
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
    
    const embed = new Discord.MessageEmbed()
        .setTitle(`Configuration for ${guild.name}`)
        .setTimestamp();
    
    Object.keys(guildConfig).map(prop => {
        embed.addField(prop, guildConfig[prop]);
    });
    
    return embed;
}

function init() {
    loadAvailableVoicesAndLangCodes();

    bot.login(token);
    const port = process.env.PORT || 9090;
    app.listen(port, () => logger.info(`Express server listening on port ${port}`));
}

process.on('unhandledRejection', err => logger.error(`Uncaught Promise Rejection:\n${err}`));

init();