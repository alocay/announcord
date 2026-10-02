import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerRegistry } from '../../src/announce/announcerRegistry.js';
import type { GuildAnnouncer } from '../../src/announce/guildAnnouncer.js';
import {
  handleGuildDelete,
  handleVoiceStateUpdate,
  toRawVoiceChange,
  type EventDeps,
  type VoiceStateLike,
} from '../../src/discord/eventWiring.js';
import type { Announcement } from '../../src/domain.js';
import { silentLogger } from '../../src/logger.js';
import { migrate, openDatabase, type Schema } from '../../src/settings/db.js';
import { SettingsStore } from '../../src/settings/settingsStore.js';

const BOT_ID = 'bot';

interface FakeMember {
  id: string;
  nickname: string | null;
  user: { bot: boolean; username: string; globalName: string | null };
}

function member(id: string, overrides: Partial<FakeMember> = {}): FakeMember {
  return {
    id,
    nickname: null,
    user: { bot: false, username: `user_${id}`, globalName: null },
    ...overrides,
  };
}

const armando = member('u1', {
  nickname: 'Mando',
  user: { bot: false, username: 'alocay', globalName: 'Armando' },
});
const friend = member('u2');
const musicBot = member('m1', { user: { bot: true, username: 'tunes', globalName: null } });

/** Builds a guild whose channels hold the given members. */
function guild(channels: Record<string, FakeMember[]>, botChannelId: string | null = null) {
  return {
    id: 'g1',
    afkChannelId: 'afk',
    channels: {
      cache: new Map(
        Object.entries(channels).map(([id, members]) => [
          id,
          { members: new Map(members.map((m) => [m.id, m])) },
        ]),
      ),
    },
    members: { me: { id: BOT_ID, voice: { channelId: botChannelId } } },
  };
}

function states(
  who: FakeMember,
  from: string | null,
  to: string | null,
  g = guild({}),
): [VoiceStateLike, VoiceStateLike] {
  return [
    { guild: g, member: who, channelId: from },
    { guild: g, member: who, channelId: to },
  ];
}

class RecordingAnnouncer {
  enqueued: Announcement[] = [];
  resets = 0;
  shutdowns = 0;
  enqueue(a: Announcement) {
    this.enqueued.push(a);
  }
  reset() {
    this.resets++;
  }
  shutdown() {
    this.shutdowns++;
  }
}

let db: Kysely<Schema>;
let store: SettingsStore;
let announcer: RecordingAnnouncer;
let registry: AnnouncerRegistry;
let deps: EventDeps;

beforeEach(async () => {
  db = openDatabase(':memory:');
  await migrate(db);
  store = new SettingsStore(db);
  announcer = new RecordingAnnouncer();
  registry = new AnnouncerRegistry(() => announcer as unknown as GuildAnnouncer);
  deps = { store, registry, isEnabled: () => true, log: silentLogger };
});

afterEach(async () => {
  await db.destroy();
});

describe('toRawVoiceChange', () => {
  it('lists candidate names as nickname, display name, username', () => {
    const raw = toRawVoiceChange(...states(armando, null, 'a'));

    expect(raw).toEqual({
      guildId: 'g1',
      userId: 'u1',
      isBot: false,
      names: ['Mando', 'Armando', 'alocay'],
      oldChannelId: null,
      newChannelId: 'a',
      afkChannelId: 'afk',
    });
  });

  it('omits names the member does not have', () => {
    expect(toRawVoiceChange(...states(friend, null, 'a'))?.names).toEqual(['user_u2']);
  });

  it('flags bots', () => {
    expect(toRawVoiceChange(...states(musicBot, null, 'a'))?.isBot).toBe(true);
  });

  it('returns null when Discord did not supply the member', () => {
    const g = guild({});
    expect(
      toRawVoiceChange(
        { guild: g, member: null, channelId: null },
        { guild: g, member: null, channelId: 'a' },
      ),
    ).toBeNull();
  });
});

describe('handleVoiceStateUpdate', () => {
  it('queues the join announcement when someone else is in the channel', async () => {
    const g = guild({ a: [armando, friend] });

    await handleVoiceStateUpdate(...states(armando, null, 'a', g), deps);

    expect(announcer.enqueued).toEqual([
      {
        guildId: 'g1',
        channelId: 'a',
        text: 'Mando has entered the channel',
        voiceId: 'Matthew',
        kind: 'enter',
      },
    ]);
  });

  it('does not count bots or the member themselves as an audience', async () => {
    const g = guild({ a: [armando, musicBot] });

    await handleVoiceStateUpdate(...states(armando, null, 'a', g), deps);

    expect(announcer.enqueued).toEqual([]);
  });

  it('applies the guild settings, member override and channel rules from the store', async () => {
    await store.updateGuild('g1', { enterTemplate: 'Behold, %name' });
    await store.setOverrideField('g1', 'u1', 'pronunciation', 'Ar-mahn-doe', 'u1');
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setRule('g1', 'b', 'deny');
    const g = guild({ a: [armando, friend], b: [armando, friend] });

    await handleVoiceStateUpdate(...states(armando, null, 'a', g), deps);
    await handleVoiceStateUpdate(...states(armando, null, 'b', g), deps);

    expect(announcer.enqueued).toMatchObject([
      { channelId: 'a', text: 'Behold, Ar-mahn-doe', voiceId: 'Joanna' },
    ]);
  });

  it('announces the exit first on a move out of the channel the bot is sitting in', async () => {
    const g = guild({ a: [friend], b: [armando, friend] }, 'a');

    await handleVoiceStateUpdate(...states(armando, 'a', 'b', g), deps);

    expect(announcer.enqueued.map((a) => [a.channelId, a.kind])).toEqual([
      ['a', 'exit'],
      ['b', 'enter'],
    ]);
  });

  it('does nothing in a guild where speech is not enabled', async () => {
    const g = guild({ a: [armando, friend] });
    deps.isEnabled = () => false;

    await handleVoiceStateUpdate(...states(armando, null, 'a', g), deps);

    expect(announcer.enqueued).toEqual([]);
  });

  it('ignores other bots', async () => {
    const g = guild({ a: [musicBot, friend] });

    await handleVoiceStateUpdate(...states(musicBot, null, 'a', g), deps);

    expect(announcer.enqueued).toEqual([]);
  });

  it('clears the queue when the bot itself is disconnected from voice', async () => {
    const me = member(BOT_ID, { user: { bot: true, username: 'announcord', globalName: null } });
    const g = guild({ a: [friend] });
    registry.get('g1');

    await handleVoiceStateUpdate(...states(me, 'a', null, g), deps);

    expect(announcer.resets).toBe(1);
  });

  it('does not create an announcer just because the bot left voice', async () => {
    const me = member(BOT_ID, { user: { bot: true, username: 'announcord', globalName: null } });
    let made = 0;
    deps.registry = new AnnouncerRegistry(() => {
      made++;
      return announcer as unknown as GuildAnnouncer;
    });

    await handleVoiceStateUpdate(...states(me, 'a', null, guild({})), deps);

    expect(made).toBe(0);
  });
});

describe('handleGuildDelete', () => {
  it('shuts the announcer down and forgets the guild settings', async () => {
    await store.updateGuild('g1', { style: 'exit' });
    registry.get('g1');

    await handleGuildDelete({ id: 'g1', available: true }, deps);

    expect(announcer.shutdowns).toBe(1);
    expect((await store.getGuild('g1')).style).toBe('both');
  });

  it('keeps the settings when the guild is only unavailable because of a Discord outage', async () => {
    await store.updateGuild('g1', { style: 'exit' });
    registry.get('g1');

    await handleGuildDelete({ id: 'g1', available: false }, deps);

    expect(announcer.shutdowns).toBe(1);
    expect((await store.getGuild('g1')).style).toBe('exit');
  });
});
