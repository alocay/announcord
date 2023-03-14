import { ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import settingsKeys from "../settings/settingsKeys";
import SettingsManager from "../settings/settingsManager";

export const SetAnnounceChannel: Command = {
    data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Sets which channel should be announced")
    .addChannelOption(option =>
        option.setName("channel")
            .setDescription("The channel to announce"))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: async (interaction: ChatInputCommandInteraction) => {
        let content = "Oops something went wrong!";
        if (interaction.guildId) {
            const option = interaction.options.get("channel");
            if (option) {
                SettingsManager.update(interaction.guildId, settingsKeys.ANNOUNCEMENT_CHANNEL_ID, option.channel?.id);
                content = `Announcement channel set to ${option.channel?.name}.`
            } else {
                const announcementChannelId = SettingsManager.get(interaction.guild?.id, settingsKeys.ANNOUNCEMENT_CHANNEL_ID);
                if (!announcementChannelId) {
                    content = "No announcement channel set.";
                } else {
                    const announcementChannel = await interaction.guild?.channels.fetch(announcementChannelId);
                    content = `Announcement channel set to ${announcementChannel?.name}.`
                }
            }
        }

        await interaction.followUp({
            ephemeral: true,
            content
        });
    }
};