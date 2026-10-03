import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrations } from '../../src/settings/migrations.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Schema } from '../../src/settings/db.js';
import { SettingsStore } from '../../src/settings/settingsStore.js';
import { tierOf } from '../../src/settings/tiers.js';

let db: Kysely<Schema>;
let store: SettingsStore;

beforeEach(async () => {
  db = openDatabase(':memory:');
  await migrate(db);
  store = new SettingsStore(db);
});

afterEach(async () => {
  await db.destroy();
});

describe('migrate', () => {
  it('can run twice without error', async () => {
    await expect(migrate(db)).resolves.toBeUndefined();
  });
});

describe('guild settings', () => {
  it('creates a guild with defaults on first read', async () => {
    expect(await store.getGuild('g1')).toEqual({
      guildId: 'g1',
      style: 'both',
      ignoreEmpty: true,
      provider: 'polly',
      voiceId: 'Matthew',
      enterTemplate: null,
      exitTemplate: null,
      sneakingAllowed: true,
    });
  });

  it('persists an update and returns the new settings', async () => {
    const updated = await store.updateGuild('g1', { style: 'join', ignoreEmpty: false });

    expect(updated).toMatchObject({ style: 'join', ignoreEmpty: false, voiceId: 'Matthew' });
    expect(await store.getGuild('g1')).toEqual(updated);
  });

  it('makes writes visible to another store on the same database', async () => {
    await store.updateGuild('g1', { enterTemplate: 'hi %name' });

    expect((await new SettingsStore(db).getGuild('g1')).enterTemplate).toBe('hi %name');
  });

  it('can set a template back to the default', async () => {
    await store.updateGuild('g1', { exitTemplate: 'bye' });
    await store.updateGuild('g1', { exitTemplate: null });

    expect((await store.getGuild('g1')).exitTemplate).toBeNull();
  });

  it('keeps guilds separate', async () => {
    await store.updateGuild('g1', { voiceId: 'Joanna' });

    expect((await store.getGuild('g2')).voiceId).toBe('Matthew');
  });
});

describe('member overrides', () => {
  it('returns null when a member has no override', async () => {
    expect(await store.getOverride('g1', 'u1')).toBeNull();
  });

  it('stores one field without touching the others', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setOverrideField('g1', 'u1', 'pronunciation', 'Ar-mahn-doe', 'admin');

    expect(await store.getOverride('g1', 'u1')).toEqual({
      voiceId: 'Joanna',
      enterTemplate: null,
      exitTemplate: null,
      pronunciation: 'Ar-mahn-doe',
      sneak: false,
      silenced: false,
    });
  });

  it('records who made the last change', async () => {
    await store.setOverrideField('g1', 'u1', 'enterTemplate', 'hello', 'admin9');

    const row = await db
      .selectFrom('member_overrides')
      .select('updated_by')
      .executeTakeFirstOrThrow();
    expect(row.updated_by).toBe('admin9');
  });

  it('removes the row once every field has been cleared', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setOverrideField('g1', 'u1', 'voiceId', null, 'u1');

    expect(await store.getOverride('g1', 'u1')).toBeNull();
    expect(await db.selectFrom('member_overrides').selectAll().execute()).toEqual([]);
  });

  it('clearing a field on a member with no override is a no-op', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', null, 'u1');

    expect(await db.selectFrom('member_overrides').selectAll().execute()).toEqual([]);
  });

  it('clears every field at once and reports whether anything existed', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');

    expect(await store.clearOverride('g1', 'u1')).toBe(true);
    expect(await store.clearOverride('g1', 'u1')).toBe(false);
    expect(await store.getOverride('g1', 'u1')).toBeNull();
  });

  it('keeps the same member separate across guilds', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');

    expect(await store.getOverride('g2', 'u1')).toBeNull();
  });
});

describe('sneak and silence', () => {
  it('allows sneaking by default and can disallow it', async () => {
    expect((await store.getGuild('g1')).sneakingAllowed).toBe(true);

    await store.updateGuild('g1', { sneakingAllowed: false });

    expect((await store.getGuild('g1')).sneakingAllowed).toBe(false);
  });

  it('starts every member neither sneaking nor silenced', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');

    expect(await store.getOverride('g1', 'u1')).toMatchObject({ sneak: false, silenced: false });
  });

  it('stores the sneak and silenced flags', async () => {
    await store.setFlag('g1', 'u1', 'sneak', true, 'u1');
    await store.setFlag('g1', 'u2', 'silenced', true, 'admin');

    expect(await store.getOverride('g1', 'u1')).toMatchObject({ sneak: true, silenced: false });
    expect(await store.getOverride('g1', 'u2')).toMatchObject({ sneak: false, silenced: true });
  });

  it('removes the row once a flag is turned off and nothing else is set', async () => {
    await store.setFlag('g1', 'u1', 'sneak', true, 'u1');
    await store.setFlag('g1', 'u1', 'sneak', false, 'u1');

    expect(await store.getOverride('g1', 'u1')).toBeNull();
  });

  it('keeps a member whose only setting is a flag', async () => {
    await store.setFlag('g1', 'u1', 'silenced', true, 'admin');
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setOverrideField('g1', 'u1', 'voiceId', null, 'u1');

    expect(await store.getOverride('g1', 'u1')).toMatchObject({ silenced: true });
  });

  it('clearing a member removes their own settings and sneak but never a silence', async () => {
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setFlag('g1', 'u1', 'sneak', true, 'u1');
    await store.setFlag('g1', 'u1', 'silenced', true, 'admin');

    expect(await store.clearOverride('g1', 'u1')).toBe(true);

    expect(await store.getOverride('g1', 'u1')).toEqual({
      voiceId: null,
      enterTemplate: null,
      exitTemplate: null,
      pronunciation: null,
      sneak: false,
      silenced: true,
    });
    expect(await store.clearOverride('g1', 'u1')).toBe(false);
  });

  it('lists the silenced members of a guild', async () => {
    await store.setFlag('g1', 'u1', 'silenced', true, 'admin');
    await store.setFlag('g1', 'u2', 'sneak', true, 'u2');
    await store.setFlag('g1', 'u3', 'silenced', true, 'admin');
    await store.setFlag('g2', 'u4', 'silenced', true, 'admin');

    expect(await store.getSilenced('g1')).toEqual(['u1', 'u3']);
  });

  it('upgrades a database created before sneak and silence existed', async () => {
    const old = openDatabase(':memory:');
    await new Migrator({
      db: old,
      provider: { getMigrations: async () => ({ '0001_initial': migrations['0001_initial']! }) },
    }).migrateToLatest();
    const now = new Date().toISOString();
    await old
      .insertInto('guilds')
      .values({ guild_id: 'g1', style: 'exit', created_at: now, updated_at: now } as never)
      .execute();
    await old
      .insertInto('member_overrides')
      .values({
        guild_id: 'g1',
        user_id: 'u1',
        voice_id: 'Joanna',
        updated_at: now,
        updated_by: 'u1',
      } as never)
      .execute();

    await migrate(old);
    const upgraded = new SettingsStore(old);

    expect(await upgraded.getGuild('g1')).toMatchObject({ style: 'exit', sneakingAllowed: true });
    expect(await upgraded.getOverride('g1', 'u1')).toMatchObject({
      voiceId: 'Joanna',
      sneak: false,
      silenced: false,
    });
    await old.destroy();
  });
});

describe('channel rules', () => {
  it('starts with no rules', async () => {
    expect((await store.getRules('g1')).size).toBe(0);
  });

  it('sets and replaces a rule for a channel', async () => {
    await store.setRule('g1', 'c1', 'deny');
    await store.setRule('g1', 'c1', 'allow');
    await store.setRule('g1', 'c2', 'deny');

    expect([...(await store.getRules('g1'))]).toEqual([
      ['c1', 'allow'],
      ['c2', 'deny'],
    ]);
  });

  it('removes a rule and reports whether one existed', async () => {
    await store.setRule('g1', 'c1', 'deny');

    expect(await store.removeRule('g1', 'c1')).toBe(true);
    expect(await store.removeRule('g1', 'c1')).toBe(false);
    expect((await store.getRules('g1')).size).toBe(0);
  });
});

describe('deleteGuild', () => {
  it('removes settings, overrides and rules but keeps usage history', async () => {
    await store.updateGuild('g1', { style: 'exit' });
    await store.setOverrideField('g1', 'u1', 'voiceId', 'Joanna', 'u1');
    await store.setRule('g1', 'c1', 'deny');
    await db
      .insertInto('usage')
      .values({ guild_id: 'g1', month: '2026-10', provider: 'polly', chars: 42 })
      .execute();

    await store.deleteGuild('g1');

    expect((await store.getGuild('g1')).style).toBe('both');
    expect(await store.getOverride('g1', 'u1')).toBeNull();
    expect((await store.getRules('g1')).size).toBe(0);
    expect(await db.selectFrom('usage').select('chars').execute()).toEqual([{ chars: 42 }]);
  });
});

describe('tierOf', () => {
  it('is unlimited for an allowlisted guild and standard otherwise', () => {
    const unlimited = new Set(['g1']);

    expect(tierOf('g1', unlimited)).toBe('unlimited');
    expect(tierOf('g2', unlimited)).toBe('standard');
  });
});
