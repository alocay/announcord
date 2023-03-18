import { Client, Interaction, Events, ChatInputCommandInteraction } from "discord.js";
import { Commands } from "../botCommands";
import ErrorUtils from "../errors/errorUtils";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

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
        logger.error(`Cannot find command with name ${interaction.commandName}`)
        interaction.followUp({ content: "An error has occurred" });
        return;
    }

    try {
        await interaction.deferReply();

        slashCommand.execute(interaction);
    } catch (error) {
        ErrorUtils.handleError(error, `An error occurred executing command ${interaction.commandName}`);
        interaction.followUp({ content: "Oops something went wrong" });
    }
};