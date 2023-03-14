import { Client, GatewayIntentBits } from "discord.js";
import { readyListener, interactionCreateListener, enterExitChannelListener } from "./listeners";
import { token } from "./config.json";
import loggerModule from "./logger";

const logger = loggerModule(__filename);

logger.info("Bot is starting...");

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

client.login(token);