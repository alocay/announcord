import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Schema } from '../../src/settings/db.js';
import { ClipCache } from '../../src/tts/clipCache.js';
import type { TtsProvider, Voice } from '../../src/tts/provider.js';
import { TtsDisabledError, TtsService } from '../../src/tts/ttsService.js';
import { UsageMeter } from '../../src/tts/usageMeter.js';

const VOICES: Voice[] = [
  { id: 'Matthew', name: 'Matthew', languageCode: 'en-US', languageName: 'US English' },
  { id: 'Joanna', name: 'Joanna', languageCode: 'en-US', languageName: 'US English' },
];

class FakeProvider implements TtsProvider {
  readonly id = 'fake';
  calls: Array<{ text: string; voiceId: string }> = [];
  failures = 0;
  hang = false;

  async listVoices(): Promise<Voice[]> {
    return VOICES;
  }

  async engineFor(): Promise<string> {
    return 'neural';
  }

  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    this.calls.push({ text, voiceId });
    if (this.hang) return new Promise(() => {});
    if (this.failures > 0) {
      this.failures--;
      throw new Error('synthesis failed');
    }
    return Buffer.from(`${voiceId}:${text}`);
  }
}

let dir: string;
let db: Kysely<Schema>;
let provider: FakeProvider;
let meter: UsageMeter;
let service: TtsService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'announcord-tts-'));
  db = openDatabase(':memory:');
  await migrate(db);
  provider = new FakeProvider();
  meter = new UsageMeter(db);
  const cache = new ClipCache(dir, 1_000_000);
  await cache.init();
  service = new TtsService({
    provider,
    cache,
    meter,
    unlimited: new Set(['g1']),
    timeoutMs: 50,
  });
});

afterEach(async () => {
  await db.destroy();
  await rm(dir, { recursive: true, force: true });
});

describe('UsageMeter', () => {
  it('accumulates characters per guild for the current month', async () => {
    await meter.add('g1', 'polly', 10);
    await meter.add('g1', 'polly', 5);
    await meter.add('g2', 'polly', 99);

    expect(await meter.get('g1')).toBe(15);
  });

  it('starts from zero in a new month', async () => {
    let now = new Date('2026-10-31T23:59:00Z');
    const clock = new UsageMeter(db, () => now);
    await clock.add('g1', 'polly', 10);

    now = new Date('2026-11-01T00:00:00Z');

    expect(await clock.get('g1')).toBe(0);
  });

  it('reports zero for a guild with no usage', async () => {
    expect(await meter.get('nobody')).toBe(0);
  });
});

describe('TtsService.getClip', () => {
  it('synthesizes on a miss and meters the characters to the guild', async () => {
    const clip = await service.getClip('g1', 'hello', 'Joanna', 'Matthew');

    expect(clip.toString()).toBe('Joanna:hello');
    expect(await meter.get('g1')).toBe(5);
  });

  it('serves a repeat from the cache without synthesizing or metering again', async () => {
    await service.getClip('g1', 'hello', 'Joanna', 'Matthew');
    await service.getClip('g1', 'hello', 'Joanna', 'Matthew');

    expect(provider.calls).toHaveLength(1);
    expect(await meter.get('g1')).toBe(5);
  });

  it('meters concurrent identical requests once', async () => {
    await Promise.all([
      service.getClip('g1', 'hello', 'Joanna', 'Matthew'),
      service.getClip('g1', 'hello', 'Joanna', 'Matthew'),
    ]);

    expect(provider.calls).toHaveLength(1);
    expect(await meter.get('g1')).toBe(5);
  });

  it('refuses a guild that is not allowlisted, without calling the provider', async () => {
    await expect(service.getClip('g2', 'hello', 'Joanna', 'Matthew')).rejects.toBeInstanceOf(
      TtsDisabledError,
    );
    expect(provider.calls).toEqual([]);
  });

  it('retries once after a failure', async () => {
    provider.failures = 1;

    const clip = await service.getClip('g1', 'hello', 'Joanna', 'Matthew');

    expect(clip.toString()).toBe('Joanna:hello');
    expect(provider.calls).toHaveLength(2);
  });

  it('gives up after the retry also fails', async () => {
    provider.failures = 2;

    await expect(service.getClip('g1', 'hello', 'Joanna', 'Matthew')).rejects.toThrow(
      'synthesis failed',
    );
    expect(provider.calls).toHaveLength(2);
    expect(await meter.get('g1')).toBe(0);
  });

  it('rejects when the provider does not answer in time', async () => {
    provider.hang = true;

    await expect(service.getClip('g1', 'hello', 'Joanna', 'Matthew')).rejects.toThrow(/timed out/);
  });

  it('falls back to the guild voice when the requested voice no longer exists', async () => {
    const clip = await service.getClip('g1', 'hello', 'Retired', 'Joanna');

    expect(clip.toString()).toBe('Joanna:hello');
  });

  it('falls back to the built-in default voice when the guild voice is also gone', async () => {
    const clip = await service.getClip('g1', 'hello', 'Retired', 'AlsoRetired');

    expect(clip.toString()).toBe('Matthew:hello');
  });
});

describe('TtsService.findVoice', () => {
  it('matches a voice id regardless of case', async () => {
    expect((await service.findVoice('joanna'))?.id).toBe('Joanna');
  });

  it('returns null for an unknown voice', async () => {
    expect(await service.findVoice('Nobody')).toBeNull();
  });
});
