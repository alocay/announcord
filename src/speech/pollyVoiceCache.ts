import { DescribeVoicesCommand, DescribeVoicesCommandInput, DescribeVoicesCommandOutput, Voice } from "@aws-sdk/client-polly";
import { Polly } from "./polly";
import loggerModule from "../logger";

const logger = loggerModule(__filename);

class PollyVoiceCache {
    voicesByLanguage: Map<string, Voice[]>;
    voices: Voice[];
    languageCodes: string[];
    languages: string[];
    private static instance: PollyVoiceCache;

    private constructor() {
        this.voicesByLanguage = new Map();
        this.voices = new Array();
        this.languageCodes = new Array();
        this.languages = new Array();
    }

    public static getInstance(): PollyVoiceCache {
        if(!PollyVoiceCache.instance) {
            PollyVoiceCache.instance = new PollyVoiceCache();
        }

        return PollyVoiceCache.instance;
    }

    public init() {
        this.loadVoices();
    }

    private async loadVoices() {
        if (this.voicesByLanguage.size > 0) {
            return;
        }

        const describeVoicesCommandInput: DescribeVoicesCommandInput = {
            IncludeAdditionalLanguageCodes: true,
        };
        const describeVoicesCommand = new DescribeVoicesCommand(describeVoicesCommandInput);

        const response: DescribeVoicesCommandOutput = await Polly.client.send(describeVoicesCommand);

        if (!response.Voices) {
            logger.error('No voices returned from Polly');
            return;
        }

        this.processResponse(response);
    }

    private processResponse(response: DescribeVoicesCommandOutput) {
        response.Voices?.forEach(voice => {
            const key = voice.LanguageName?.toLowerCase();

            if (!key) {
                return;
            }

            this.upsertVoice(key, voice);
            this.addVoice(voice);
            this.addLanguageCode(voice.LanguageCode);
            this.addLanguage(voice.LanguageName);
        });
    }

    private upsertVoice(key: string, voice: Voice) {
        if (this.voicesByLanguage.has(key)) {
            let voices = this.voicesByLanguage.get(key);
            if (!voices) {
                voices = [voice];;
            } else {
                voices.push(voice);
            }
            this.voicesByLanguage.set(key, voices);
        } else {
            this.voicesByLanguage.set(key, [voice]);
        }
    }

    private addVoice(voice: Voice) {
        this.voices.push(voice);
    }

    private addLanguageCode(code: string | undefined) {
        if (!code) {
            return;
        }

        if (!this.languageCodes.includes(code.toLowerCase())) {
            this.languageCodes.push(code.toLowerCase());
        }
    }

    private addLanguage(languageName: string | undefined) {
        if (!languageName) {
            return;
        }

        if (!this.languages.includes(languageName)) {
            this.languages.push(languageName);
        }
    }
}

export const VoiceCache: PollyVoiceCache = PollyVoiceCache.getInstance();