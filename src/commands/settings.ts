import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder, Guild, GuildMember, Collection, User, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../command";
import BotSettings from "../settings/settings";
import settingsKeys from "../settings/settingsKeys";
import { GuildSettings } from "../interfaces/guildSettings";
import Utils from "../utils";
import SettingsManager from "../settings/settingsManager";
import ErrorUtils from "../errors/errorUtils";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export const Settings: Command = {
    data: new SlashCommandBuilder()
        .setName("settings")
        .setDescription("Shows the server or user settings")
        .addSubcommand(subcommand =>
            subcommand
                .setName("user")
                .setDescription("Gets the user settings")
                .addUserOption(option =>
                    option.setName("name")
                        .setDescription("The name of the user")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("server")
                .setDescription("Gets the server settings"))
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
    execute: async (interaction: ChatInputCommandInteraction) => {
        try {
        if (!interaction.guildId || !interaction.guild) {
            throw new Error("No guild in interaction");
        }

        let content = new EmbedBuilder();
        if (interaction.options.getSubcommand(false) === "user") {
            content = await getUserSettingsEmbed(interaction);
        } else {
            content = await buildSettingsMessage(interaction.guild, BotSettings.settings.get(interaction.guildId));
        }

        await interaction.followUp({
            ephemeral: true,
            embeds: [content]
        });
        } catch (error) {
            await ErrorUtils.handleInteractionError(error, interaction);
        }
    },
};

async function getUserSettingsEmbed(interaction: ChatInputCommandInteraction): Promise<EmbedBuilder> {
    const user = interaction.options.get("name")?.user || interaction.user;
    return getUserSettingsDisplay(interaction.guild, user);
}

function getUserSettingsDisplay(guild: Guild | null, user: User): EmbedBuilder {
    const name = guild ? Utils.findMemberNameById(user.id, guild) : user.username;
    const embed = new EmbedBuilder()
        .setTitle(`Settings for ${name}`)
        .setTimestamp();

    const userAlert = SettingsManager.getUserAlert(guild?.id, user.id);
    const userVoice = SettingsManager.getUserVoice(guild?.id, user.id);
    
    embed.addFields(
        { name: "Voice", value: userVoice?.voice || "None" },
        { name: "Enter Announcement", value: userAlert?.enterAlertFormat || "None" },
        { name: "Exit Announcement", value: userAlert?.exitAlertFormat || "None" }
    );

    return embed;
}

async function buildSettingsMessage(guild: Guild, settings: GuildSettings): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
        .setTitle(`Settings for ${guild.name}`)
        .setTimestamp();

    const anySettings = settings as any;
    for (const [key, val] of Object.entries(settings)) {
        if (key === settingsKeys.USER_VOICES || key === settingsKeys.USER_ALERTS) {
            continue;
        }

        let value = getValueDisplay(val, guild);

        if (key === settingsKeys.ANNOUNCEMENT_CHANNEL_ID) {
            value = await Utils.getChannelName(val, guild);
        }

        embed.addFields({ name: getKeyText(key), value: value.toString() });
    }

    return embed;
}

function getKeyText(key: string) {
    switch(key) {
        case settingsKeys.ANNOUNCEMENT_CHANNEL_ID:
            return "Announcement Channel";
        case settingsKeys.DEFAULT_ENTER_ALERT:
            return "Default Enter Alert";
        case settingsKeys.DEFAULT_EXIT_ALERT:
            return "Default Exit Alert";
        case settingsKeys.VOICE:
            return "Default Voice";
        case settingsKeys.USER_ALERTS:
            return "Member Custom Alerts";
        case settingsKeys.USER_VOICES:
            return "Member Custom Voices";
        default:
            return key;
}
}

function getValueDisplay(value: any, guild: Guild): string {
    if (value == null || value == undefined) {
        return 'N/A';
    }

    return value.toString();
};