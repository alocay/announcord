import bot from '../bot.js';
import announcers from '../announcers.js';
import logger from '../logger.js';
import { findMember } from '../utils.js';

const { defaultSettings } = require('../config.json');

function clearAlert(message, clearAlertArgs) {
    if (!clearAlertArgs || 
        !clearAlertArgs.length || 
        !clearAlertArgs[0]) {
        _clearUserAlerts(message);
        return;
    }

    const user = clearAlertArgs[0].toLowerCase();
    let alertType = null;

    if (clearAlertArgs.length > 1) {
        alertType = clearAlertArgs[1];
    }

    _removeUserAlert(user, alertType, message);
}

function _clearUserAlerts(message) {
    bot.settings.setProp(message.guild.id, 'userAlerts', {});
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserAlerts(bot.settings.userAlerts);
    }
    
    message.reply('All member alerts have been cleared.');
}

function _removeUserAlert(userId, alertType, message) {
    const { id, name } = findMember(userId, mesage.guild.members.cache);
    
    if (!id) {
        message.reply('No matching user found for `' + userId + '`.');
        return;
    }

    logger.debug('Found user ' + name + ' ' + id); 
    const settings = bot.settings.ensure(message.guild.id, defaultSettings);

    if (!settings.userAlerts[id]) {
        message.reply('No alerts found for `' + name + '`.');
        return;
    }

    logger.debug(`Removing ${alertType} alert for ${name}`);

    if (!alertType) {
        delete settings.userAlerts[id];
    } else if ('enter'.includes(alertType.toLowerCase())) {
        settings.userAlerts[id].enter = null;
    } else if ('exit'.includes(alertType.toLowerCase())) {
        settings.userAlerts[id].exit = null;
    }

    bot.settings.setProp(message.guild.id, 'userAlerts', settings.userAlerts);

    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateUserAlerts(bot.settings.userAlerts);
    }
    
    message.reply('Alert for `' + name + '` has been cleared.');
}

export default [
    {
        name: 'clearAlert',
        description: 'Clear all user specific alerts. This has no affect on the default alerts.',
        usage: 'clearAlert',
        action: clearAlert
    },
    {
        name: 'clearAlert',
        description: 'Clear a specific users enter or exit. If `enter` or `exit` are not provided, both will be cleared. This has no affect on the default alerts.',
        usage: 'clearAlert <name> <enter|exit (optional)>',
        action: clearAlert
    }
];
