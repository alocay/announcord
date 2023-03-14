import { CommandInteraction, Client, Interaction, Events, ChatInputCommandInteraction } from "discord.js";
import { Commands } from "../botCommands";

export function interactionCreateListener(client: Client): void {
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(client, interaction);
        }
    });
};

const handleSlashCommand = async (client: Client, interaction: ChatInputCommandInteraction): Promise<void> => {
    const slashCommand = Commands.find(c => c.data.name === interaction.commandName);
    if (!slashCommand) {
        interaction.followUp({ content: "An error has occurred" });
        return;
    }

    await interaction.deferReply();

    slashCommand.execute(interaction);
};