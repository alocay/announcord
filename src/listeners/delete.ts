import { Client, Guild } from "discord.js";
import BotSettings from "../settings/settings";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export default (client: Client): void => {
    client.on("guildDelete", async (guild: Guild) => {
        logger.debug(`Deleting guild ${guild.name}...`);
        BotSettings.settings.delete(guild.id);
    });
};