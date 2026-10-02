import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerRegistry } from '../../src/announce/announcerRegistry.js';
import {
  GuildAnnouncer,
  SkipAnnouncement,
  type VoiceTransport,
} from '../../src/announce/guildAnnouncer.js';
import type { Announcement } from '../../src/domain.js';
import { silentLogger } from '../../src/logger.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Records what was played; each playback finishes only when the test says so. */
class FakeTransport implements VoiceTransport {
  played: string[] = [];
  leaves = 0;
  private current: Deferred<void> | null = null;

  currentChannelId(): string | null {
    return null;
  }

  play(_channelId: string, clip: Buffer): Promise<void> {
    this.played.push(clip.toString());
    this.current = deferred<void>();
    return this.current.promise;
  }

  leave(): void {
    this.leaves++;
  }

  async finish(): Promise<void> {
    this.current?.resolve();
    await flush();
  }

  async fail(): Promise<void> {
    this.current?.reject(new Error('playback failed'));
    await flush();
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0);

function announcement(text: string): Announcement {
  return { guildId: 'g1', channelId: 'c1', text, voiceId: 'Matthew', kind: 'enter' };
}

const IDLE_MS = 60_000;
let transport: FakeTransport;
let clips: Map<string, Deferred<Buffer>>;
let announcer: GuildAnnouncer;

/** Enqueues an announcement whose clip is ready immediately. */
function say(text: string): void {
  announcer.enqueue(announcement(text));
  clips.get(text)!.resolve(Buffer.from(text));
}

beforeEach(() => {
  vi.useFakeTimers();
  transport = new FakeTransport();
  clips = new Map();
  announcer = new GuildAnnouncer({
    transport,
    getClip: (a) => {
      const d = deferred<Buffer>();
      clips.set(a.text, d);
      return d.promise;
    },
    idleMs: IDLE_MS,
    log: silentLogger,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GuildAnnouncer', () => {
  it('plays announcements one at a time, in the order they were queued', async () => {
    say('one');
    say('two');
    await flush();
    expect(transport.played).toEqual(['one']);

    await transport.finish();
    expect(transport.played).toEqual(['one', 'two']);
  });

  it('keeps queue order even when a later clip is ready first', async () => {
    announcer.enqueue(announcement('slow'));
    announcer.enqueue(announcement('fast'));
    clips.get('fast')!.resolve(Buffer.from('fast'));
    await flush();
    expect(transport.played).toEqual([]);

    clips.get('slow')!.resolve(Buffer.from('slow'));
    await flush();
    await transport.finish();

    expect(transport.played).toEqual(['slow', 'fast']);
  });

  it('skips an announcement whose clip could not be made and carries on', async () => {
    announcer.enqueue(announcement('broken'));
    say('fine');
    clips.get('broken')!.reject(new Error('polly down'));
    await flush();

    expect(transport.played).toEqual(['fine']);
  });

  it('carries on after a playback failure', async () => {
    say('one');
    say('two');
    await flush();

    await transport.fail();

    expect(transport.played).toEqual(['one', 'two']);
  });

  it('drops the oldest waiting announcement once more than ten are queued', async () => {
    say('playing');
    await flush();
    for (let i = 1; i <= 11; i++) say(`w${i}`);

    for (let i = 0; i < 12; i++) await transport.finish();

    expect(transport.played).toEqual([
      'playing',
      ...Array.from({ length: 10 }, (_, i) => `w${i + 2}`),
    ]);
  });

  it('skips an announcement that waited longer than fifteen seconds', async () => {
    say('one');
    say('stale');
    await flush();

    await vi.advanceTimersByTimeAsync(15_001);
    say('fresh');
    await transport.finish();

    expect(transport.played).toEqual(['one', 'fresh']);
  });

  it('leaves the channel after the idle period', async () => {
    say('one');
    await flush();
    await transport.finish();
    expect(transport.leaves).toBe(0);

    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(transport.leaves).toBe(1);
  });

  it('stays in the channel when a new announcement arrives before the idle period ends', async () => {
    say('one');
    await flush();
    await transport.finish();
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);

    say('two');
    await flush();
    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(transport.leaves).toBe(0);
    expect(transport.played).toEqual(['one', 'two']);
  });

  it('clears the queue on reset and plays normally afterwards', async () => {
    say('one');
    say('two');
    await flush();

    announcer.reset();
    await transport.fail(); // the interrupted playback ends in an error
    expect(transport.played).toEqual(['one']);

    say('three');
    await flush();
    expect(transport.played).toEqual(['one', 'three']);
  });

  it('does not leave on an idle timer that was pending when reset happened', async () => {
    say('one');
    await flush();
    await transport.finish();

    announcer.reset();
    await vi.advanceTimersByTimeAsync(IDLE_MS);

    expect(transport.leaves).toBe(0);
  });

  it('warns about an unexpected failure but stays quiet about an expected skip', async () => {
    const warnings: unknown[] = [];
    const log = Object.assign(Object.create(silentLogger), {
      warn: (...args: unknown[]) => warnings.push(args),
    });
    const failing: VoiceTransport = {
      currentChannelId: () => null,
      play: async (channelId) => {
        throw channelId === 'locked' ? new SkipAnnouncement('no permission') : new Error('boom');
      },
      leave: () => {},
    };
    const quiet = new GuildAnnouncer({
      transport: failing,
      getClip: async () => Buffer.from('x'),
      idleMs: IDLE_MS,
      log,
    });

    quiet.enqueue({ ...announcement('a'), channelId: 'locked' });
    await flush();
    expect(warnings).toHaveLength(0);

    quiet.enqueue({ ...announcement('b'), channelId: 'open' });
    await flush();
    expect(warnings).toHaveLength(1);
  });

  it('leaves the channel on shutdown', () => {
    announcer.shutdown();

    expect(transport.leaves).toBe(1);
  });
});

describe('AnnouncerRegistry', () => {
  it('creates one announcer per guild and reuses it', () => {
    const made: string[] = [];
    const registry = new AnnouncerRegistry((guildId) => {
      made.push(guildId);
      return announcer;
    });

    expect(registry.get('g1')).toBe(registry.get('g1'));
    registry.get('g2');

    expect(made).toEqual(['g1', 'g2']);
  });

  it('shuts an announcer down when its guild is removed', () => {
    const registry = new AnnouncerRegistry(() => announcer);
    registry.get('g1');

    registry.delete('g1');

    expect(transport.leaves).toBe(1);
    expect(registry.peek('g1')).toBeUndefined();
  });

  it('shuts every announcer down', () => {
    const registry = new AnnouncerRegistry(() => announcer);
    registry.get('g1');

    registry.shutdownAll();

    expect(transport.leaves).toBe(1);
  });
});
