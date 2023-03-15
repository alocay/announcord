import { Client, Guild } from "discord.js";
import BotSettings from "../settings/settings";
import { defaultSettings } from "../config.json";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export default (client: Client): void => {
    client.on("guildCreate", async (guild: Guild) => {
        logger.debug(`New guild ${guild.name}, creating settings for it`);
        BotSettings.settings.ensure(guild.id, defaultSettings);
    });
};