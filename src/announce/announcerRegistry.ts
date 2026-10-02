import type { GuildAnnouncer } from './guildAnnouncer.js';

/** Lazily creates and tracks the announcer of each guild. */
export class AnnouncerRegistry {
  private readonly announcers = new Map<string, GuildAnnouncer>();

  constructor(private readonly make: (guildId: string) => GuildAnnouncer) {}

  get(guildId: string): GuildAnnouncer {
    let announcer = this.announcers.get(guildId);
    if (!announcer) {
      announcer = this.make(guildId);
      this.announcers.set(guildId, announcer);
    }
    return announcer;
  }

  /** The guild's announcer if one has been created; never creates one. */
  peek(guildId: string): GuildAnnouncer | undefined {
    return this.announcers.get(guildId);
  }

  delete(guildId: string): void {
    this.announcers.get(guildId)?.shutdown();
    this.announcers.delete(guildId);
  }

  shutdownAll(): void {
    for (const announcer of this.announcers.values()) announcer.shutdown();
    this.announcers.clear();
  }
}
