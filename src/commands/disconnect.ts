import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import { VoiceConnectionManager } from "../audio/voiceConnectionManager";

export const Disconnect: Command = {
    data: new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("Forces Announcord to disconnect from any voice channel it may be in")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: async (interaction: ChatInputCommandInteraction) => {
        VoiceConnectionManager.destroy();

        await interaction.followUp({
            ephemeral: true,
            content: "Disconnecting Announcord..."
        });
    },
};