import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';
import { findMember } from '../utils.js';
const { defaultSettings } = require('../config.json');


function setEnterAlertFormat(message, alertArgs) {
    logger.debug('Setting enter alert format...');
  
    const { id, name, alertFormat } = verifyAlertFormat(alertArgs, message);
    
    logger.debug(`Alert format: ${alertFormat}`);
    
    if (!alertFormat || !id) return;
    
    const settings = bot.settings.ensure(message.guild.id, defaultSettings);
    
    if (!settings.userAlerts[id]) {
        settings.userAlerts[id] = {};
    }

    settings.userAlerts[id].enter = alertFormat;
    bot.settings.setProp(message.guild.id, 'userAlerts', settings.userAlerts);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserEnterAlert(id, alertFormat);
    }
    
    message.reply('The enter alert for `' + name + '` has been updated.');
}

function setExitAlertFormat(message, alertArgs) {
    logger.debug('Setting user exit alert format...');

    const { id, name, alertFormat } = verifyAlertFormat(alertArgs, message);
    
    const settings = bot.settings.ensure(message.guild.id, defaultSettings);
    
    if (!settings.userAlerts[id]) {
        settings.userAlerts[id] = {};
    }

    settings.userAlerts[id].exit = alertFormat;
    bot.settings.setProp(message.guild.id, 'userAlerts', settings.userAlerts);
    bot.settings.setProp(message.guild.id, 'exitAlert', alertFormat);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserExitAlert(id, alertFormat);
    }
    
    message.reply('The exit alert for `' + name + '` has been updated.');
}

function verifyAlertFormat(alertArgs, message) {
    if (alertArgs === null || 
        alertArgs === undefined ||
        alertArgs.length < 1) {
        message.reply('You must provide a name and message format when setting the alert');
        return null;
    }
 
    const { attempt, id, name, alertFormat } = parseAlertArgs(alertArgs, message);

    if (!id) {
        message.reply('No matching member found for `' + attempt + '`.');
        return null;
    }

    if (!alertFormat || alertFormat === "") {
        message.reply('You must provide a message format when setting the alert');
        return null;
    }
    
    const alertLengthCheck = alertFormat.replace('%name', '');    
    if (alertLengthCheck.length > 150) {
        message.reply('The alert message is too long. Max length is 150 characters not including `%name`');
        return null;
    }
    
    return { id, name, alertFormat };
}

function parseAlertArgs(alertArgs, message) {
    if (!alertArgs[0].startsWith('"')) {
        const attempt = alertArgs[0];
        const { id, name } = findMember(attempt, message.guild.members.cache);

        if (!id) return null;
        
        const alertFormat = alertArgs.slice(1).join(' ').trim();
        return { attempt, id, name, alertFormat };
    }

    const fullArgs = alertArgs.join(' ').trim();
    const endQuote = fullArgs.indexOf('"', 1);

    if (endQuote < 0) return null;

    const attempt = fullArgs.substring(1, endQuote);
    const { id, name } = findMember(attempt, message.guild.members.cache);
    const alertFormat = fullArgs.substring(endQuote + 1).trim();

    return { attempt, id, name, alertFormat };
}

export default [
    {
        name: 'userEnter',
        description: "Changes the enter alert message format for a specific member. Use `%name` in the format for the entering user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'userEnter <name> <format>',
        action: setEnterAlertFormat
    },
    {
        name: 'userExit',
        description: "Changes the exit alert message format for a specific member. Use `%name` in the format for the exiting user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'userExit <name> <format>',
        action: setExitAlertFormat
    },
];
