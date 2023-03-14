import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import ErrorUtils from "../errors/errorUtils";
import { Command } from "../command";
import settingsKeys from "../settings/settingsKeys";
import SettingsManager from "../settings/settingsManager";
import loggerModule from "../logger";
import { UserAlerts } from "src/interfaces/guildSettings";

const logger = loggerModule(__filename);

export const SetEnterAlert: Command = {
    data: new SlashCommandBuilder()
    .setName("enter")
    .setDescription("Sets the custom enter announcement")
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
                content = getCustomEnterAlertText(interaction.guildId, interaction.user.id);
            } else {
                content = setEnterAlertAndGetConfirmationText(interaction.guildId, interaction.user.id, formatOption.toString());
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

function getCustomEnterAlertText(guildId: string, userId: string | undefined) {
    const userAlerts: UserAlerts = SettingsManager.get(guildId, settingsKeys.USER_ALERTS);
    const defaultAlert: string = SettingsManager.get(guildId, settingsKeys.DEFAULT_ENTER_ALERT);
    if (!userId || !userAlerts[userId]) {
        return `No custom enter announcement set - Using default server announcement: \n \`${defaultAlert}\``;
    } else {
        const userAlert = userAlerts[userId];
        return `Enter announcement set to: \n \`${userAlert.enterAlertFormat}\``;
    }
}

function setEnterAlertAndGetConfirmationText(guildId: string, userId: string | undefined, format: string): string {
    SettingsManager.updateUserEnterAlert(guildId, userId, format);
    return `Enter announcement set to: \n \`${format}\``;
}