import Discord from 'discord.js';
import bot from '../bot.js';
import logger from '../logger.js';
const { defaultSettings, hardCodedPrefix } = require('../config.json');

function displayHelp(message, helpArgs, commands) {
    const guildConfig = bot.settings.ensure(message.guild.id, defaultSettings);
    
    try {   
        const helpEmbed = createEmbedHelpMessage(message.guild, commands);        
        message.author.send(helpEmbed);
        message.reply('A DM has been sent with the help info');
    } catch(e) {
        logger.error(e);
        logger.error('Error display help', e);
    }
}

function createEmbedHelpMessage(guild, commands) {
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

export default [
    {
        name: 'help',
        description: 'Display help info for Announcord',
        usage: `help`,
        action: displayHelp,
        public: true
    }
];
