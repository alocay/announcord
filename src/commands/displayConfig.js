import Discord from 'discord.js';
import bot from '../bot.js';
import { findMemberNameById, getChannelName, getArrayValues } from '../utils.js';

const { defaultSettings } = require('../config.json');

function displayGuildConfig(message) {
    const configEmbed = createEmbedConfigMessage(message.guild);
    message.reply(configEmbed);
}

function createEmbedConfigMessage(guild) {
    const guildConfig = bot.settings.ensure(guild.id, defaultSettings);
    
    const embed = new Discord.MessageEmbed()
        .setTitle(`Configuration for ${guild.name}`)
        .setTimestamp();
    
    Object.keys(guildConfig).map(prop => {
        let value = _getValueDisplay(guildConfig[prop], guild);

        if (prop == "userVoices") {
            value = _getUserVoiceDisplay(guildConfig[prop], guild);
        } else if (prop == "userAlerts") {
            value = _getUserAlertsDisplay(guildConfig[prop], guild);
        }
        
        embed.addField(prop, value);
    });
    
    return embed;
}

function _getUserVoiceDisplay(voices, guild) {
    if (!Object.keys(voices).length) {
        return 'None';
    }
    
    let values = Object.keys(voices).map(prop => {
        const name = findMemberNameById(prop, guild.members.cache);
        if (name != undefined && name != null) {
            return `${name}: ${voices[prop].voice}`;
        }
    });

    return values.join('\n');
}

function _getUserAlertsDisplay(alerts, guild) {
    if (!Object.keys(alerts).length) {
        return 'None';
    }

    let values = Object.keys(alerts).map(prop => {
        const name = findMemberNameById(prop, guild.members.cache);
        if (name != undefined && name != null) {
           return `${name} - Enter: ${(alerts[prop].enter ? alerts[prop].enter : 'None')} \n Exit: ${(alerts[prop].exit ? alerts[prop].exit : 'None')}`;  
        }
    });

    return values.join(", \n");
}

function _getValueDisplay(value, guild) {
    if (value == null || value == undefined) {
        return 'N/A';
    }
    
    if (Array.isArray(value)) {
        return getArrayValues(value, getChannelName.bind(this, guild));
    }

    return value;
};

export default [
    {
        name: 'settings',
        description: 'Displays the current configuration',
        usage: 'settings',
        action: displayGuildConfig,
        public: true
    }
];
