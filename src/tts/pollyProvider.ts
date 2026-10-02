import {
  DescribeVoicesCommand,
  SynthesizeSpeechCommand,
  type DescribeVoicesCommandOutput,
  type Engine,
  type SynthesizeSpeechCommandOutput,
  type VoiceId,
} from '@aws-sdk/client-polly';
import type { TtsProvider, Voice } from './provider.js';

/** The part of `PollyClient` this provider uses; lets tests pass a stub. */
export interface PollySender {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(command: any): Promise<any>;
}

const VOICE_LIST_TTL_MS = 24 * 60 * 60 * 1000;

// Cheapest first choice that still sounds good. Voices offering neither engine
// (long-form or generative only) cost several times more and are not exposed.
const ENGINE_PREFERENCE = ['neural', 'standard'] as const;

interface KnownVoices {
  list: Voice[];
  engines: Map<string, string>;
  loadedAt: number;
}

export class PollyProvider implements TtsProvider {
  readonly id = 'polly';
  private known: KnownVoices | null = null;

  constructor(
    private readonly client: PollySender,
    private readonly now: () => number = Date.now,
  ) {}

  async listVoices(): Promise<Voice[]> {
    return (await this.load()).list;
  }

  async engineFor(voiceId: string): Promise<string> {
    const engine = (await this.load()).engines.get(voiceId);
    if (!engine) throw new Error(`Unknown Polly voice: ${voiceId}`);
    return engine;
  }

  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const output = (await this.client.send(
      new SynthesizeSpeechCommand({
        Engine: (await this.engineFor(voiceId)) as Engine,
        // Discord voice carries Opus, so this plays without transcoding.
        OutputFormat: 'ogg_opus',
        Text: text,
        // Always plain text: user-supplied names must never be parsed as SSML.
        TextType: 'text',
        VoiceId: voiceId as VoiceId,
      }),
    )) as SynthesizeSpeechCommandOutput;

    const bytes = await output.AudioStream?.transformToByteArray();
    if (!bytes || bytes.length === 0) throw new Error('Polly returned no audio');
    return Buffer.from(bytes);
  }

  private async load(): Promise<KnownVoices> {
    if (this.known && this.now() - this.known.loadedAt < VOICE_LIST_TTL_MS) return this.known;

    try {
      this.known = await this.fetchVoices();
    } catch (error) {
      // A stale list beats no speech at all.
      if (!this.known) throw error;
    }
    return this.known;
  }

  private async fetchVoices(): Promise<KnownVoices> {
    const list: Voice[] = [];
    const engines = new Map<string, string>();
    let nextToken: string | undefined;

    do {
      const page = (await this.client.send(
        new DescribeVoicesCommand({ NextToken: nextToken }),
      )) as DescribeVoicesCommandOutput;

      for (const v of page.Voices ?? []) {
        const engine = ENGINE_PREFERENCE.find((e) => v.SupportedEngines?.includes(e));
        if (!v.Id || !engine) continue;
        engines.set(v.Id, engine);
        list.push({
          id: v.Id,
          name: v.Name ?? v.Id,
          languageCode: v.LanguageCode ?? '',
          languageName: v.LanguageName ?? '',
        });
      }
      nextToken = page.NextToken;
    } while (nextToken);

    list.sort((a, b) => a.id.localeCompare(b.id));
    return { list, engines, loadedAt: this.now() };
  }
}
