import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "src/command";
import { GuildSettings } from "src/interfaces/guildSettings";
import BotSettings from "../settings/settings";

export const Version: Command = {
    data: new SlashCommandBuilder()
        .setName("version")
        .setDescription("Returns the current version of the saved settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: async (interaction: ChatInputCommandInteraction) => {
        let content = "No settings found";
            if (interaction.guildId) {
                const settings: GuildSettings = BotSettings.settings.get(interaction.guildId);
                content = settings.version;
            }

            await interaction.followUp({
                ephemeral: true,
                content
            });
    },
};