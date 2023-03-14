import { CacheType, ChatInputCommandInteraction, CommandInteraction, CommandInteractionOption, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../command";
import { VoiceCache } from "../speech";
import loggerModule from "../logger";
import { Voice } from "@aws-sdk/client-polly";
import SettingsManager from "../settings/settingsManager";
import settingsKeys from "../settings/settingsKeys";
import Utils from "../utils";

const logger = loggerModule(__filename);

export const GetVoices: Command = {
    data: new SlashCommandBuilder()
        .setName("voices")
        .setDescription("Displays the various voices available. If no option provided, will user server default.")
        .addStringOption(option =>
            option.setName("language")
                .setDescription("The language to filter the voices by."))
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect),
    execute: async (interaction: ChatInputCommandInteraction) => {
        if (!interaction.guildId) {
            logger.error("No guild ID in interaction");
            await interaction.followUp({
                ephemeral: true,
                content: "Oops something went wrong."
            });
            return;
        }

        const option = interaction.options.get("language");
        const language = findLanguage(option, interaction.guildId);
        let voices = Utils.getVoicesByLanguage(language);

        if (!voices || voices.length === 0) {
            logger.debug(`No voices found for filter ${option?.value} - sending back all voices`);
            voices = VoiceCache.voices;
        }

        const voicesEmbed = getVoicesDisplay(voices, language)

        await interaction.followUp({
            ephemeral: true,
            embeds: [voicesEmbed]
        });
    },
};

function findLanguage(languageOption: CommandInteractionOption<CacheType> | null, guildId: string): string {
    const language = !!languageOption && languageOption.value
            ? languageOption.value.toString() 
            : SettingsManager.get(guildId, settingsKeys.LANGUAGE);
    return VoiceCache.languages.find(l => l.toLowerCase().includes(language.toLowerCase())) || "";
}

function getVoicesDisplay(voices: Voice[], language: string): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`Available ${language} Voices for Announcord`)
        .setDescription('**Note:** Available voices can be found @ https://docs.aws.amazon.com/polly/latest/dg/voicelist.html')
        .setTimestamp();

    let voicesString = "";
    for(let v of voices) {
        const field = getLanguageLabelAndVoiceIds(v);
        voicesString = voicesString.concat(`${field.ids} \n`);
    };

    embed.addFields({ name: "Voices", value: voicesString });
    return embed;
}

function getLanguageLabelAndVoiceIds(voice: Voice) {
    const label = `${voice.LanguageName} (${voice.LanguageCode})`;
    return { label: label, ids: voice.Id || "" };
}