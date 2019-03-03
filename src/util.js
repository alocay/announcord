function findChannel(guild, channelIdOrName) {
    let channel = guild.channels.get(channelIdOrName);
    
    if (!channel || channel.type.toLowerCase() !== 'voice') {
        channel = guild.channels.find(c => c.name.toLowerCase().startsWith(channelIdOrName) && c.type.toLowerCase() === 'voice');
    }
    
    return channel;
}

function getChannelName(guild, channelId) {
    let channel = guild.channels.get(channelId);
    
    if (!channel) {
        return channelId; 
    }
    
    return channel.name;
}


function getArrayValues(array, displayFunc) {    
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

export { getChannelName, getArrayValues, findChannel };