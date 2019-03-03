import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';
const { defaultSettings } = require('../config.json');


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

export default [
    {
        name: 'enterAlert',
        description: "Changes the enter alert message format. Use `%name` for the entering user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'enterAlert <format>',
        action: setEnterAlertFormat
    },
    {
        name: 'exitAlert',
        description: "Changes the exit alert message format. Use `%name` for the exiting user's name. Max length allowed is 150 characters not including `%name`.",
        usage: 'exitAlert <format>',
        action: setExitAlertFormat
    }
];