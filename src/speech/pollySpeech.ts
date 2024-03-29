import { SynthesizeSpeechCommand, SynthesizeSpeechCommandInput, SynthesizeSpeechCommandOutput, OutputFormat } from "@aws-sdk/client-polly";
import { Polly } from "./polly";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

export class PollySpeech {
    public async getSpeechStream(text: string, voiceId: string, languageCode: string, engine: string): Promise<Buffer> {
        return await this.synthesizeSpeech(text, voiceId, languageCode, engine);
    }

    private async synthesizeSpeech(text: string, voiceId: string, languageCode: string, engine: string): Promise<Buffer> {
        const command = new SynthesizeSpeechCommand(this.buildSynthesizeSpeedCommandInput(text, voiceId, languageCode, engine));
        const response: SynthesizeSpeechCommandOutput = await Polly.client.send(command);

        const byteArray = await response.AudioStream?.transformToByteArray();

        if(!byteArray) {
            return Buffer.from([]);
        }

        return Buffer.from(byteArray);
    }

    private buildSynthesizeSpeedCommandInput(text: string, voiceId: string, languageCode: string, engine: string): SynthesizeSpeechCommandInput {
        return {
            LanguageCode: languageCode,
            OutputFormat: OutputFormat.OGG_VORBIS,
            Text: text,
            VoiceId: voiceId,
            Engine: engine || "standard"
        };
    }
}