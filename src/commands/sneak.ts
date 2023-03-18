import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import SettingsManager from "../settings/settingsManager";
import ErrorUtils from "../errors/errorUtils";
import settingsKeys from "../settings/settingsKeys";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export const Sneak: Command = {
    data: new SlashCommandBuilder()
        .setName("sneak")
        .setDescription("Disables announcements for the user")
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
    execute: async (interaction: ChatInputCommandInteraction) => {
        try {
            let content = "Oops something went wrong!";
            if (!interaction.user?.id) {
                throw new Error("No user ID in interaction");
            }

            if (!interaction.guildId) {
                throw new Error("No guild ID in interaction");
            }

            const isSneakingAllowed = SettingsManager.get(interaction.guildId, settingsKeys.SNEAKING_ALLOWED);
            if (!isSneakingAllowed) {
                await interaction.followUp({
                    ephemeral: true,
                    content: "Sorry, sneaking is not allowed on this server"
                });

                return;
            }

            content = toggleSneak(interaction.guildId, interaction.user.id);

            await interaction.followUp({
                ephemeral: true,
                content
            });
        } catch (error: unknown) {
            logger.error(`Error toggling sneak for ${interaction.user?.username} in ${interaction.guild?.name}`);
            await ErrorUtils.handleInteractionError(error, interaction);
        }
    },
};

function toggleSneak(guildId: string, userId: string): string {
    const newValue = SettingsManager.toggleSneak(guildId, userId);

    return newValue ? "You are now sneaking" : "You are no longer sneaking";
}