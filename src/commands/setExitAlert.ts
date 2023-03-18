import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import ErrorUtils from "../errors/errorUtils";
import { Command } from "../command";
import settingsKeys from "../settings/settingsKeys";
import SettingsManager from "../settings/settingsManager";
import { UserAlerts } from "../interfaces/guildSettings";
import Utils from "../utils";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export const SetExitAlert: Command = {
    data: new SlashCommandBuilder()
    .setName("exit")
    .setDescription("Sets the custom exit announcement")
    .addStringOption(option =>
        option.setName("format")
            .setDescription("The announcement format. Use %name in place of your nickname in the announcement."))
    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
    execute: async (interaction: ChatInputCommandInteraction) => {
        try {
            let content = "Oops something went wrong!";
            if (!interaction.guildId) {
                throw new Error("No guild ID in interaction");
            }

            const formatOption = interaction.options.get("format")?.value;
            if (!formatOption) {
                content = getCustomExitAlertText(interaction.guildId, interaction.user.id);
            } else {
                content = setExitAlertAndGetConfirmationText(interaction.guildId, interaction.user.id, formatOption.toString());
            }

            await interaction.followUp({
                ephemeral: true,
                content
            });
        } catch (error: unknown) {
            await ErrorUtils.handleInteractionError(error, interaction);
        }
    }
};

function getCustomExitAlertText(guildId: string, userId: string | undefined) {
    const userAlerts: UserAlerts = SettingsManager.get(guildId, settingsKeys.USER_ALERTS);
    const defaultAlert: string = SettingsManager.get(guildId, settingsKeys.DEFAULT_EXIT_ALERT);
    if (!userId || !userAlerts[userId]?.exitAlertFormat) {
        return `No custom exit announcement set - Using default server announcement: \n \`${defaultAlert}\``;
    } else {
        const userAlert = userAlerts[userId];
        return `Exit announcement set to: \n \`${userAlert.exitAlertFormat}\``;
    }
}

function setExitAlertAndGetConfirmationText(guildId: string, userId: string | undefined, format: string): string {
    if (format.length > Utils.getMaxAnnouncementCharacters()) {
        throw Error(`Announcement cannot be longer than ${Utils.getMaxAnnouncementCharacters()} characters`);
    }
    
    SettingsManager.updateUserExitAlert(guildId, userId, format);
    return `Exit announcement set to: \n \`${format}\``;
}