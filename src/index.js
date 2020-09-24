'use strict';

import express from 'express';
import Discord from 'discord.js';
import semver from 'semver';

import { Polly, voices } from './polly.js';
import Announcer from './announcer.js';
import bot from './bot.js';
import { defaultSettings, token, hardCodedPrefix } from './config.json';
import logger from './logger.js';
import commands from './commands';
import announcers from './announcers.js';

const currentVersion = defaultSettings.version;

bot.once('ready', () => {
    logger.info('Initializing bot...');
    bot.guilds.cache.forEach((guild) => {
        const settings = bot.settings.ensure(guild.id, defaultSettings);
        checkAndUpdateConfig(guild.id, settings);
        
        announcers.set(
            guild.id, 
            new Announcer(
                guild, 
                settings.style, 
                settings.ignoreEmpty, 
                settings.voice, 
                settings.languageCode, 
                settings.enterAlert, 
                settings.exitAlert,
                settings.userVoices,
                settings.userAlerts,
                settings.blacklist,
                settings.whitelist
            )
        );
    });
    
    logger.info('Ready');
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
    
    const voiceStateGuild = bot.guilds.cache.get(newState.guild.id);
    
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
    
    logger.debug(`command: ${commandName}`);
    
    const command = commands.find(c => c.name.toLowerCase().startsWith(commandName));
    if (command) {
        logger.debug(`Command found: ${command.name}`);
        if (!command.public && !message.member.permissions.has('ADMINISTRATOR')) {
            message.reply(`The ${command.name} command can only be run by administrators`);
            return;
        }
        
        command.action(message, commandArgs, (command.name === 'help' ? commands : null));
        return;
    }
    else {
        logger.debug('Command not found')
    }
});

function checkAndUpdateConfig(guildId, config) {
    // update config if version isn't there or it's older than the current version
    if (!config.version || semver.gt(currentVersion, config.version)) {
        logger.debug(`Config out of date (${config.version}) - updating to ${currentVersion}`);
        const updatedConfig = Object.assign({}, defaultSettings, config);
        updatedConfig.version = currentVersion;
        logger.debug(`Config update - ${updatedConfig.version}`);
        bot.settings.set(guildId, updatedConfig);
    } else {
        logger.debug('Config up to date');
    }
}

function init() {
    bot.settings.defer.then(() => {
        bot.login(token);
    });
}

process.on('unhandledRejection', err => logger.error(`Uncaught Promise Rejection:\n${err}`));

init();
