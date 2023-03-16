import { CommandInteraction } from "discord.js";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export default class ErrorUtils {
    public static async handleInteractionError(error: unknown, interaction: CommandInteraction) {
        ErrorUtils.handleError(error);
        await interaction.followUp({
            ephemeral: true,
            content: "Oops something went wrong"
        });
    }

    public static async handleError(error: unknown, message?: string | undefined) {
        let errorMessage = "An error occurred";

        if (typeof error === "string") {
            errorMessage = error;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        logger.error(message ? `${message}: ${errorMessage}` : errorMessage);
    }
}