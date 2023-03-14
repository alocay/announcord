import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, StreamType } from "@discordjs/voice";
import { PassThrough } from "stream";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export default class Player {
    audioPlayer: AudioPlayer;
    
    constructor() {
        this.audioPlayer = createAudioPlayer();

        this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
            logger.debug('The audio player has started playing!');
        });
    }

    playAudio(stream: Buffer) {
        logger.debug("Building buffer stream...");
        const bufferStream = new PassThrough();
        bufferStream.end(stream);

        logger.debug("Building audio resource...");
        const resource = createAudioResource(bufferStream, {
            inputType: StreamType.Arbitrary
        });

        logger.debug("Playing audio...");
        this.audioPlayer.play(resource);
    }
}