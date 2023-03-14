import { Client, Guild } from "discord.js";
import BotSettings from "../settings/settings";
import { defaultSettings } from "../config.json";

export default (client: Client): void => {
    client.on("guildCreate", async (guild: Guild) => {
        BotSettings.settings.ensure(guild.id, defaultSettings);
        // announcers.set(guild.id, new Announcer(guild, settings.announce, settings.ignoreEmpty));
    });
};