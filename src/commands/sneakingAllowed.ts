import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import SettingsManager from "../settings/settingsManager";
import settingsKeys from "../settings/settingsKeys";
import ErrorUtils from "../errors/errorUtils";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export const SneakingAllowed: Command = {
    data: new SlashCommandBuilder()
        .setName("sneak_allowed")
        .setDescription("Toggles sneaking on the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: async (interaction: ChatInputCommandInteraction) => {
        try {
            let content = "Oops something went wrong!";

            if (!interaction.guildId) {
                throw new Error("No guild ID in interaction");
            }

            content = toggleSneakingAllowed(interaction.guildId);

            await interaction.followUp({
                ephemeral: true,
                content
            });
        } catch (error: unknown) {
            logger.error(`Error toggling sneak setting for ${interaction.guild?.name}`);
            await ErrorUtils.handleInteractionError(error, interaction);
        }
    },
};

function toggleSneakingAllowed(guildId: string): string {
    const isSneakingAllowed = SettingsManager.toggleValue(guildId, settingsKeys.SNEAKING_ALLOWED);

    if (!isSneakingAllowed) {
        SettingsManager.disableAllUserSneaking(guildId);
    }

    return isSneakingAllowed ? "Sneaking allowed" : "Sneaking not allowed";
}