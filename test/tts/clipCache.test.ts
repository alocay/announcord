import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClipCache, clipKey } from '../../src/tts/clipCache.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'announcord-cache-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function open(maxBytes = 1_000_000): Promise<ClipCache> {
  const cache = new ClipCache(dir, maxBytes);
  await cache.init();
  return cache;
}

const bytes = (n: number, fill = 1) => Buffer.alloc(n, fill);

describe('clipKey', () => {
  it('differs when any part differs', () => {
    const keys = new Set([
      clipKey('polly', 'neural', 'Matthew', 'hi'),
      clipKey('polly', 'standard', 'Matthew', 'hi'),
      clipKey('polly', 'neural', 'Joanna', 'hi'),
      clipKey('polly', 'neural', 'Matthew', 'hi!'),
      clipKey('kokoro', 'neural', 'Matthew', 'hi'),
    ]);
    expect(keys.size).toBe(5);
  });

  it('does not confuse a separator inside the text with a part boundary', () => {
    expect(clipKey('p', 'e', 'v|x', 'y')).not.toBe(clipKey('p', 'e', 'v', 'x|y'));
  });
});

describe('ClipCache', () => {
  it('creates a clip on a miss and returns it from disk on the next request', async () => {
    const cache = await open();
    let calls = 0;
    const create = async () => {
      calls++;
      return bytes(10, 7);
    };

    const first = await cache.getOrCreate('k1', create);
    const second = await cache.getOrCreate('k1', create);

    expect(first).toEqual({ clip: bytes(10, 7), hit: false });
    expect(second).toEqual({ clip: bytes(10, 7), hit: true });
    expect(calls).toBe(1);
  });

  it('survives a restart', async () => {
    await (await open()).getOrCreate('k1', async () => bytes(10));

    const reopened = await open();
    const result = await reopened.getOrCreate('k1', async () => {
      throw new Error('should not synthesize');
    });

    expect(result.hit).toBe(true);
  });

  it('shares one synthesis between concurrent requests for the same clip', async () => {
    const cache = await open();
    let calls = 0;
    const create = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return bytes(10);
    };

    const results = await Promise.all([
      cache.getOrCreate('k1', create),
      cache.getOrCreate('k1', create),
    ]);

    expect(calls).toBe(1);
    expect(results.map((r) => r.hit)).toEqual([false, true]);
  });

  it('caches nothing when synthesis fails, so the next request tries again', async () => {
    const cache = await open();

    await expect(
      cache.getOrCreate('k1', async () => {
        throw new Error('polly down');
      }),
    ).rejects.toThrow('polly down');
    const retry = await cache.getOrCreate('k1', async () => bytes(10));

    expect(retry.hit).toBe(false);
  });

  it('evicts the least recently used clip when over the size cap', async () => {
    const cache = await open(25);
    await cache.getOrCreate('a', async () => bytes(10));
    await cache.getOrCreate('b', async () => bytes(10));
    await cache.getOrCreate('a', async () => bytes(10)); // touch a; b is now oldest
    await cache.getOrCreate('c', async () => bytes(10)); // 30 bytes > 25: evict b

    const a = await cache.getOrCreate('a', async () => bytes(10));
    const c = await cache.getOrCreate('c', async () => bytes(10));
    const b = await cache.getOrCreate('b', async () => bytes(10));

    expect([a.hit, c.hit, b.hit]).toEqual([true, true, false]);
  });

  it('treats a zero-byte file left by a crash as a miss and overwrites it', async () => {
    const probe = new ClipCache(dir, 1_000_000);
    const file = probe.pathFor('k1');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.alloc(0));

    const cache = await open();
    const first = await cache.getOrCreate('k1', async () => bytes(10, 9));
    const second = await cache.getOrCreate('k1', async () => bytes(1));

    expect(first).toEqual({ clip: bytes(10, 9), hit: false });
    expect(second).toEqual({ clip: bytes(10, 9), hit: true });
  });

  it('recovers when a cached file disappears from disk', async () => {
    const cache = await open();
    await cache.getOrCreate('k1', async () => bytes(10));
    await rm(cache.pathFor('k1'));

    const result = await cache.getOrCreate('k1', async () => bytes(10, 5));

    expect(result).toEqual({ clip: bytes(10, 5), hit: false });
  });
});
