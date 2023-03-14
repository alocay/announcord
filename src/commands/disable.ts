import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import SettingsManager from "../settings/settingsManager";
import settingsKeys from "../settings/settingsKeys";

export const Disable: Command = {
    data: new SlashCommandBuilder()
        .setName("disable")
        .setDescription("Toggles the bot - when disabled it will not announce anything")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: async (interaction: ChatInputCommandInteraction) => {
        let content = "Oops something went wrong!";
        if (interaction.guildId) {
            const isEnabled: boolean = SettingsManager.get(interaction.guild?.id, settingsKeys.ENABLED);
            const newValue = !isEnabled;
            SettingsManager.update(interaction.guild?.id, settingsKeys.ENABLED, newValue);
            content = `Announcord is now ${newValue ? "enabled" : "disabled"}`;
        }

        await interaction.followUp({
            ephemeral: true,
            content
        });
    },
};