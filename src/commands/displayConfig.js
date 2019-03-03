import Discord from 'discord.js';
import bot from '../bot.js';
import { getChannelName, getArrayValues } from '../util.js';

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
        let value = guildConfig[prop];
        
        if (value == null | value == undefined) {
            value = 'N/A';
        }
        
        if (Array.isArray(value)) {
            value = getArrayValues(value, getChannelName.bind(this, guild));
        }            
        
        embed.addField(prop, value);
    });
    
    return embed;
}

export default [
    {
        name: 'settings',
        description: 'Displays the current configuration',
        usage: 'settings',
        action: displayGuildConfig,
        public: true
    }
];