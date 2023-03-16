import { getVoiceConnection, joinVoiceChannel, PlayerSubscription, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { GuildBasedChannel } from "discord.js";
import Player from "./player";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

class VoiceConnectionHandler {
    connection: VoiceConnection | undefined;
    subscription: PlayerSubscription | undefined;
    subscriptionTimeoutMs: number;
    disconnectTimeoutMs: number;
    destroyTimeoutMs: number;
    subscriptionTimer: NodeJS.Timeout | undefined;
    disconnectTimer: NodeJS.Timeout | undefined;
    destroyTimer: NodeJS.Timeout | undefined;
    private player: Player | undefined;
    private static instance: VoiceConnectionHandler;

    constructor() {
        this.subscriptionTimeoutMs = 8_000;
        this.disconnectTimeoutMs = 20_000;
        this.destroyTimeoutMs = 60_000;
    }

    public static getInstance(): VoiceConnectionHandler {
        if(!VoiceConnectionHandler.instance) {
            VoiceConnectionHandler.instance = new VoiceConnectionHandler();
        }

        return VoiceConnectionHandler.instance;
    }

    public init() {
        this.player = new Player();
    }

    joinAndPlay(channel: GuildBasedChannel, resource: Buffer) {
        if (!this.player) {
            logger.error("No player set!");
            return;
        }

        logger.debug("Retrieving voice connection...");
        this.connection = getVoiceConnection(channel.guild.id);

        if (!this.connection) {
            logger.debug("No voice connection found - creating one...");
            this.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
        } else {
            const success = this.connection.rejoin({
                channelId: channel.id,
                selfDeaf: true,
                selfMute: false,
            });
            logger.debug("Success rejoining? " + success);
        }

        logger.debug("Subscribing to player...")
        this.subscription = this.connection?.subscribe(this.player.audioPlayer);

        logger.debug("Setting up ready listeners...");
        this.connection.once(VoiceConnectionStatus.Ready, () => {
            logger.debug("The connection has entered the Ready state - ready to play audio!");
            this.playAudio(resource);
        });

        logger.debug("Checking is already in ready state...");
        if (this.connection.state.status === VoiceConnectionStatus.Ready) {
            this.playAudio(resource);
        }

        this.setupDisconnect();
        this.setupDestroy();
    }

    destroy() {
        logger.debug("Destroying connection immediately...");
        this.connection?.destroy();
    }

    private playAudio(resource: Buffer): void {
        if (!this.player) {
            logger.error("No player set!");
            return;
        }

        if (!this.connection) {
            logger.debug("Connection is not defined");
            return;
        }

        this.setupSubscriptionCleanup();
        this.player.playAudio(resource);
    }

    private setupSubscriptionCleanup(): void {
        if (this.subscriptionTimer) {
            logger.debug("Removing old subscription cleanup timer...");
            clearTimeout(this.subscriptionTimer);
        }

        if (this.subscription) {
            logger.debug(`Unsubscribing in ${this.subscriptionTimeoutMs / 1000}s...`);
            // Unsubscribe after 5 seconds (stop playing audio on the voice connection)
            this.subscriptionTimer = setTimeout(() => {
                logger.debug("Unsubscribing...");
                this.subscription?.unsubscribe();
            }, this.subscriptionTimeoutMs);
        }
    }

    private setupDisconnect(): void {
        if (this.disconnectTimer) {
            logger.debug("Removing old disconnect timer...");
            clearTimeout(this.disconnectTimer);
        }

        if (this.connection) {
            logger.debug(`Disconnecting in ${this.disconnectTimeoutMs / 1000}s...`);
            this.disconnectTimer = setTimeout(() => {
                logger.debug("Disconnecting...");
                this.connection?.disconnect();
            }, this.disconnectTimeoutMs);
        }
    }

    private setupDestroy(): void {
        if (this.destroyTimer) {
            logger.debug("Removing old destroy timer...");
            clearTimeout(this.destroyTimer);
        }

        if (this.connection) {
            logger.debug(`Destroying in ${this.destroyTimeoutMs / 1000}s...`);
            this.destroyTimer = setTimeout(() => {
                logger.debug("Destroying...");
                this.connection?.destroy();
            }, this.destroyTimeoutMs);
        }
    }
}

export const VoiceConnectionManager: VoiceConnectionHandler = VoiceConnectionHandler.getInstance();