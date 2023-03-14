import Enmap from "enmap";
import semver from "semver";
import { defaultSettings } from "../config.json";
import { GuildSettings } from "../interfaces/guildSettings";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

const settings = new Enmap({
    name: "announcord-settings",
    autoFetch: true,
    fetchAll: false
});

function checkAndUpdateConfig(guildId: string, config: GuildSettings) {
    const currentVersion = defaultSettings.version;

    // update config if version isn't there or it's older than the current version
    if (!config.version || semver.gt(currentVersion, config.version)) {
        logger.debug(`Config out of date (${config.version}) - updating to ${currentVersion}`);
        const updatedConfig = Object.assign({}, defaultSettings, config);
        updatedConfig.version = currentVersion;
        logger.debug(`Config update - ${updatedConfig.version}`);
        settings.set(guildId, updatedConfig);
    } else {
        logger.debug('Config up to date');
    }
}

export default {
    settings,
    checkAndUpdateConfig
};