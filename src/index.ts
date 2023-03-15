import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Client, GatewayIntentBits } from "discord.js";
import { readyListener, interactionCreateListener, enterExitChannelListener } from "./listeners";
import loggerModule from "./logger";

const logger = loggerModule(__filename);
const isProduction = process.env.NODE_ENV === "production"

logger.info("Bot is starting...");

async function main(): Promise<void> {
    const secretsManagerClient = new SecretsManagerClient({
        region: "us-east-1"
    });
    const secretsCommand = new GetSecretValueCommand({
        SecretId: "prod/announcord"
    });
    const response = await secretsManagerClient.send(secretsCommand);
    const secretJson = response.SecretString;

    if (!secretJson) {
        const error = "Could not get token from secrets manager";
        logger.error(error);
        throw new Error(error);
    }

    let secrets;
    try {
        secrets = JSON.parse(secretJson);
    } catch (error) {
        logger.error(error);
        throw error;
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.Guilds
        ]
    });

    readyListener(client);
    interactionCreateListener(client);
    enterExitChannelListener(client);
    client.login(isProduction ? secrets["announcord-token"] : secrets["announcord-dev-token"]);
}

main().catch(console.error);
