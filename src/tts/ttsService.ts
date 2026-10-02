import { DEFAULTS } from '../domain.js';
import { tierOf } from '../settings/tiers.js';
import { clipKey, type ClipCache } from './clipCache.js';
import type { TtsProvider, Voice } from './provider.js';
import type { UsageMeter } from './usageMeter.js';

/** Speech is not available to this guild (it is not on the allowlist). */
export class TtsDisabledError extends Error {
  constructor(guildId: string) {
    super(`Speech is not enabled for guild ${guildId}`);
    this.name = 'TtsDisabledError';
  }
}

export interface TtsServiceDeps {
  provider: TtsProvider;
  cache: ClipCache;
  meter: UsageMeter;
  unlimited: ReadonlySet<string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export class TtsService {
  private readonly provider: TtsProvider;
  private readonly cache: ClipCache;
  private readonly meter: UsageMeter;
  private readonly unlimited: ReadonlySet<string>;
  private readonly timeoutMs: number;

  constructor(deps: TtsServiceDeps) {
    this.provider = deps.provider;
    this.cache = deps.cache;
    this.meter = deps.meter;
    this.unlimited = deps.unlimited;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isEnabledFor(guildId: string): boolean {
    return tierOf(guildId, this.unlimited) === 'unlimited';
  }

  voices(): Promise<Voice[]> {
    return this.provider.listVoices();
  }

  async findVoice(idOrName: string): Promise<Voice | null> {
    const wanted = idOrName.trim().toLowerCase();
    const voices = await this.voices();
    return (
      voices.find((v) => v.id.toLowerCase() === wanted) ??
      voices.find((v) => v.name.toLowerCase() === wanted) ??
      null
    );
  }

  /**
   * Returns the Ogg/Opus clip for `text`. A voice the provider no longer
   * offers falls back to `fallbackVoiceId`, then to the built-in default, so a
   * retired voice never silences a member.
   */
  async getClip(
    guildId: string,
    text: string,
    voiceId: string,
    fallbackVoiceId: string,
  ): Promise<Buffer> {
    if (!this.isEnabledFor(guildId)) throw new TtsDisabledError(guildId);

    const voice =
      (await this.findVoice(voiceId)) ??
      (await this.findVoice(fallbackVoiceId)) ??
      (await this.findVoice(DEFAULTS.voiceId));
    if (!voice) throw new Error(`No usable voice (wanted ${voiceId})`);

    const engine = await this.provider.engineFor(voice.id);
    const key = clipKey(this.provider.id, engine, voice.id, text);
    const { clip, hit } = await this.cache.getOrCreate(key, () =>
      this.synthesizeWithRetry(text, voice.id),
    );
    if (!hit) await this.meter.add(guildId, this.provider.id, text.length);
    return clip;
  }

  private async synthesizeWithRetry(text: string, voiceId: string): Promise<Buffer> {
    try {
      return await this.synthesizeOnce(text, voiceId);
    } catch {
      return this.synthesizeOnce(text, voiceId);
    }
  }

  private synthesizeOnce(text: string, voiceId: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Speech synthesis timed out after ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
      this.provider.synthesize(text, voiceId).then(
        (clip) => {
          clearTimeout(timer);
          resolve(clip);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
