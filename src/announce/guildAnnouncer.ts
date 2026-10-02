import type { Announcement } from '../domain.js';
import type { Logger } from '../logger.js';

/** The voice connection of one guild, as far as the announcer needs it. */
export interface VoiceTransport {
  currentChannelId(): string | null;
  /**
   * Joins or moves to the channel if needed and plays the clip. Resolves when
   * playback has finished; rejects if the clip could not be played.
   */
  play(channelId: string, clip: Buffer): Promise<void>;
  leave(): void;
}

/**
 * Thrown by a transport for a skip that is expected and already reported
 * (for example a channel the bot may not join), so it is not logged again.
 */
export class SkipAnnouncement extends Error {}

export interface GuildAnnouncerDeps {
  transport: VoiceTransport;
  getClip(announcement: Announcement): Promise<Buffer>;
  idleMs: number;
  maxQueue?: number;
  staleMs?: number;
  log: Logger;
}

interface QueuedItem {
  announcement: Announcement;
  clip: Promise<Buffer>;
  queuedAt: number;
}

const DEFAULT_MAX_QUEUE = 10;
const DEFAULT_STALE_MS = 15_000;

/**
 * Plays one guild's announcements strictly in order, one at a time, and
 * leaves the voice channel after a quiet period.
 */
export class GuildAnnouncer {
  private readonly transport: VoiceTransport;
  private readonly getClip: (announcement: Announcement) => Promise<Buffer>;
  private readonly idleMs: number;
  private readonly maxQueue: number;
  private readonly staleMs: number;
  private readonly log: Logger;

  private queue: QueuedItem[] = [];
  private draining = false;
  private idleTimer: NodeJS.Timeout | null = null;
  /** Bumped by reset() so a drain loop that was mid-await knows to stop. */
  private generation = 0;

  constructor(deps: GuildAnnouncerDeps) {
    this.transport = deps.transport;
    this.getClip = deps.getClip;
    this.idleMs = deps.idleMs;
    this.maxQueue = deps.maxQueue ?? DEFAULT_MAX_QUEUE;
    this.staleMs = deps.staleMs ?? DEFAULT_STALE_MS;
    this.log = deps.log;
  }

  enqueue(announcement: Announcement): void {
    this.cancelIdleTimer();

    // Start synthesis now so clips for a burst of joins are fetched in parallel.
    const clip = this.getClip(announcement);
    clip.catch(() => {}); // handled when its turn comes; avoid an unhandled rejection meanwhile

    this.queue.push({ announcement, clip, queuedAt: Date.now() });
    if (this.queue.length > this.maxQueue) {
      const dropped = this.queue.shift();
      this.log.warn({ text: dropped?.announcement.text }, 'announcement queue full, dropped oldest');
    }

    if (!this.draining) void this.drain();
  }

  /** Forgets everything queued. Used when the voice connection is lost. */
  reset(): void {
    this.generation++;
    this.queue = [];
    this.draining = false;
    this.cancelIdleTimer();
  }

  shutdown(): void {
    this.reset();
    this.transport.leave();
  }

  private async drain(): Promise<void> {
    const generation = this.generation;
    this.draining = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const clip = await item.clip;
        if (generation !== this.generation) return;
        if (Date.now() - item.queuedAt > this.staleMs) {
          this.log.debug({ text: item.announcement.text }, 'skipped stale announcement');
          continue;
        }
        await this.transport.play(item.announcement.channelId, clip);
      } catch (error) {
        if (generation !== this.generation) return;
        const level = error instanceof SkipAnnouncement ? 'debug' : 'warn';
        this.log[level](
          { err: error, channelId: item.announcement.channelId },
          'announcement skipped',
        );
      }
      if (generation !== this.generation) return;
    }

    this.draining = false;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.transport.leave();
    }, this.idleMs);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
