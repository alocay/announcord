import { Client, Guild } from "discord.js";
import BotSettings from "../settings/settings";

export default (client: Client): void => {
    client.on("guildDelete", async (guild: Guild) => {
        BotSettings.settings.delete(guild.id);
        // announcers.delete(guild.id);
    });
};