import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const EXTENSION = '.ogg';

export function clipKey(provider: string, engine: string, voice: string, text: string): string {
  // JSON keeps part boundaries unambiguous whatever characters the text holds.
  return createHash('sha256').update(JSON.stringify([provider, engine, voice, text])).digest('hex');
}

interface Entry {
  size: number;
  /** Monotonic counter; higher means used more recently. */
  usedAt: number;
}

/**
 * Size-capped disk cache of synthesized clips with least-recently-used
 * eviction. The same text in the same voice is only ever paid for once.
 */
export class ClipCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private totalBytes = 0;
  private clock = 0;

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
  ) {}

  pathFor(key: string): string {
    return join(this.dir, key.slice(0, 2), key + EXTENSION);
  }

  /** Indexes clips already on disk. Call once before use. */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const found: Array<{ key: string; size: number; mtimeMs: number }> = [];

    for (const shard of await readdir(this.dir, { withFileTypes: true })) {
      if (!shard.isDirectory()) continue;
      const shardDir = join(this.dir, shard.name);
      for (const name of await readdir(shardDir)) {
        const file = join(shardDir, name);
        if (!name.endsWith(EXTENSION)) {
          // A temp file from a write that never finished.
          await rm(file, { force: true });
          continue;
        }
        const info = await stat(file);
        if (info.size === 0) continue;
        found.push({ key: name.slice(0, -EXTENSION.length), size: info.size, mtimeMs: info.mtimeMs });
      }
    }

    found.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const { key, size } of found) {
      this.entries.set(key, { size, usedAt: ++this.clock });
      this.totalBytes += size;
    }
  }

  /**
   * Returns the cached clip, or runs `create` and stores its result. `hit` is
   * false only for the caller whose request caused the synthesis.
   */
  async getOrCreate(
    key: string,
    create: () => Promise<Buffer>,
  ): Promise<{ clip: Buffer; hit: boolean }> {
    const pending = this.inFlight.get(key);
    if (pending) return { clip: await pending, hit: true };

    const cached = await this.read(key);
    if (cached) return { clip: cached, hit: true };

    // Another caller may have started while we were reading the disk.
    const raced = this.inFlight.get(key);
    if (raced) return { clip: await raced, hit: true };

    const creation = (async () => {
      const clip = await create();
      await this.write(key, clip);
      return clip;
    })();
    this.inFlight.set(key, creation);
    try {
      return { clip: await creation, hit: false };
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async read(key: string): Promise<Buffer | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;

    const file = this.pathFor(key);
    try {
      const clip = await readFile(file);
      if (clip.length === 0) throw new Error('empty clip');
      entry.usedAt = ++this.clock;
      // Best effort: lets recency survive a restart.
      const now = new Date();
      utimes(file, now, now).catch(() => {});
      return clip;
    } catch {
      this.forget(key);
      return null;
    }
  }

  private async write(key: string, clip: Buffer): Promise<void> {
    if (clip.length === 0) throw new Error('Refusing to cache an empty clip');

    const file = this.pathFor(key);
    await mkdir(dirname(file), { recursive: true });
    // Write then rename, so a crash never leaves a half-written clip in place.
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, clip);
    await rename(temp, file);

    this.forget(key);
    this.entries.set(key, { size: clip.length, usedAt: ++this.clock });
    this.totalBytes += clip.length;
    await this.evict(key);
  }

  private forget(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.size;
    this.entries.delete(key);
  }

  private async evict(justWritten: string): Promise<void> {
    if (this.totalBytes <= this.maxBytes) return;

    const oldestFirst = [...this.entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key] of oldestFirst) {
      if (this.totalBytes <= this.maxBytes) break;
      if (key === justWritten) continue;
      this.forget(key);
      await rm(this.pathFor(key), { force: true });
    }
  }
}
