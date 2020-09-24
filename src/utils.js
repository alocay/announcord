import logger from './logger.js';

export function findChannel(guild, channelIdOrName) {
    let channel = guild.channels.get(channelIdOrName);
    
    if (!channel || channel.type.toLowerCase() !== 'voice') {
        channel = guild.channels.find(c => c.name.toLowerCase().startsWith(channelIdOrName) && c.type.toLowerCase() === 'voice');
    }
    
    return channel;
}

export function getChannelName(guild, channelId) {
    let channel = guild.channels.get(channelId);
    
    if (!channel) {
        return channelId; 
    }
    
    return channel.name;
}

export function getArrayValues(array, displayFunc) {    
    if (!array.length) {
        return "None";
    }
    
    let values = "";
    for (let i = 0; i < array.length; i++) {
        const displayValue = displayFunc ? displayFunc(array[i]) : array[i];
        values += displayValue + ", ";
    }
    
    return values.substr(0, values.length - 2);
}

export function findMember(partialName, members) {
    let member = null;
    logger.debug('Looking for user...');
    members.forEach(mem => {
        const name = mem.nickname ? mem.nickname.toLowerCase() : mem.user.username.toLowerCase();
        if (name.includes(partialName) && !mem.user.bot) {
            logger.debug('Found member ' + name);
            member = mem;
        }
    });

    if (!member) return { id: null, name: null };

    const name = member.nickname ? member.nickname : member.user.username;
    const id = member.user.id;
    return { id, name };
}

export function findMemberNameById(id, members) {
    const mem = members.get(id);

    if (!mem) return null;

    const name = mem.nickname ? mem.nickname : mem.user.username;
    return name;
}
