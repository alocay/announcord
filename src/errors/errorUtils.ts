import { CommandInteraction } from "discord.js";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export default class ErrorUtils {
    public static async handleInteractionError(error: unknown, interaction: CommandInteraction) {
        let errorMessage = "An error occurred";

        if (typeof error === "string") {
            errorMessage = error;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        logger.error(errorMessage);
        await interaction.followUp({
            ephemeral: true,
            content: "Oops something went wrong"
        });
    }
}