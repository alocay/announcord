import Discord from 'discord.js';

import setPrefix from './setPrefix.js';
import resetConfig from './resetConfig.js';
import help from './help.js';
import blacklistChannel from './blacklistChannel.js';
import displayConfig from './displayConfig.js';
import getVoices from './getVoices.js';
import setAnnounceStyle from './setAnnounceStyle.js';
import setVoice from './setVoice.js';
import toggleIgnoreEmpty from './toggleIgnoreEmpty.js';
import unlistChannel from './unlistChannel.js';
import updateAlertFormat from './updateAlertFormat.js';
import whitelistChannel from './whitelistChannel.js';
import clearVoice from './clearVoice.js';
import updateUserAlert from './updateUserAlert.js';
import clearAlert from './clearAlert.js';

// Note: Order of the commands here will affect how they appear in the help info
const cmdsArray = [
    setPrefix,
    setAnnounceStyle,
    toggleIgnoreEmpty,
    getVoices,
    setVoice,
    clearVoice,
    updateAlertFormat,
    updateUserAlert,
    clearAlert,
    blacklistChannel,
    whitelistChannel, 
    unlistChannel,
    displayConfig,
    resetConfig,
    help,
];

function setupCommands() {
    const flatCmds = cmdsArray.reduce((a, v) => a.concat(v), []);
    const commands = new Discord.Collection();

    for(let i = 0; i < flatCmds.length; i++) {
        commands.set(flatCmds[i].name, flatCmds[i]);
    }

    return commands;
}

export default setupCommands();
