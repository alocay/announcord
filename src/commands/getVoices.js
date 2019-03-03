
import Discord from 'discord.js';
import { voices } from '../polly.js';
import logger from '../logger.js';

function getVoices(message, langCodeArgs) {
    const langCodeFilter = langCodeArgs && langCodeArgs.length > 0 ? langCodeArgs[0] : null;
    
    message.reply('A DM will be sent with a list of available voices');
    sendVoicesCollection(message.author, langCodeFilter);
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

export default [
    {
        name: 'showVoices',
        description: 'Sends a DM containing available voices. If a language or language code is given, will filter out voices for those languages only.',
        usage: 'showVoices <language/code (optional)>',
        action: getVoices,
        public: true
    }
]