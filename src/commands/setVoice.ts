import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import SettingsManager from "../settings/settingsManager";
import settingsKeys from "../settings/settingsKeys";
import Utils from "../utils";
import { UserVoices } from "../interfaces/guildSettings";
import ErrorUtils from "../errors/errorUtils";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export const SetVoice: Command = {
    data: new SlashCommandBuilder()
        .setName("voice")
        .setDescription("Sets the voice to use for when you enter/exit a channel")
        .addStringOption(option =>
            option.setName("name")
                .setDescription("The name of the voice"))

        .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
    execute: async (interaction: ChatInputCommandInteraction) => {
        try {
            let content = "Oops something went wrong!";
            if (!interaction.guildId) {
                throw new Error("No guild ID in interaction");
            }

            const option = interaction.options.get("name");
            if (!option || !option?.value) {
                content = getCustomVoiceSetText(interaction.guildId, interaction.user.id);
            } else {
                content = setVoiceAndGetConfirmationText(interaction.guildId, interaction.user.id, option.value.toString());
            }

            await interaction.followUp({
                ephemeral: true,
                content
            });
        } catch (error: unknown) {
            logger.error("Error setting voice");
            await ErrorUtils.handleInteractionError(error, interaction);
        }
    },
};

function setVoiceAndGetConfirmationText(guildId: string, userId: string | undefined, voiceNameOption: string): string {
    const voice = Utils.findVoiceByName(voiceNameOption);

    if (!voice) {
        throw new Error(`Voice for ${voiceNameOption} not found`);
    }

    SettingsManager.updateUserVoice(guildId, userId, voice);
    return `Announcement voice set to ${voice?.Name}`;
}

function getCustomVoiceSetText(guildId: string, userId: string | undefined) {
    const userVoices: UserVoices = SettingsManager.get(guildId, settingsKeys.USER_VOICES);
    const defaultVoice: string = SettingsManager.get(guildId, settingsKeys.VOICE);
    if (!userId || !userVoices[userId]) {
        return `No custom voice set - Using default voice ${defaultVoice}`;
    } else {
        const userVoice = userVoices[userId];
        return `Your announcements voice is set to ${userVoice.voice}`;
    }
}