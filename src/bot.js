
import Discord from 'discord.js';
import Enmap from 'enmap';

const bot = new Discord.Client();

bot.settings = new Enmap({
    name: 'settings',
    fetchAll: false,
    autoFetch: true,
    cloneLevel: 'deep'
});

export default bot;