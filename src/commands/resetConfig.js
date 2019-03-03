import bot from '../bot.js';
import announcers from '../announcers.js';
const { defaultSettings } = require('../config.json');

function resetGuildConfig(message) {
    bot.settings.set(message.guild.id, defaultSettings);
    
    const announcer = announcers.get(message.guild.id);
    if (announcer) {
        announcer.updateVoiceId(defaultSettings.voice, defaultSettings.languageCode);
        announcer.updateExitAlert(defaultSettings.exitAlert);
        announcer.updateEnterAlert(defaultSettings.enterAlert);
        announcer.updateAnnouncementStyle(defaultSettings.style);
        announcer.updateIgnoreEmpty(defaultSettings.ignoreEmpty);
        announcer.updateWhitelist(defaultSettings.whitelist);
        announcer.updateBlacklist(defaultSettings.blacklist);
    }
    
    message.reply('The configuration settings have been reset. Use `settings` command to view the current settings.');
}

export default [
    {
        name: 'resetconfig',
        description: 'Resets the configuration to default',
        usage: 'resetconfig',
        action: resetGuildConfig
    }
];