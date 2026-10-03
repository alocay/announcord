import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDatabase, backupFileName } from '../../src/settings/backup.js';
import { migrate, openDatabase, type Schema } from '../../src/settings/db.js';
import { SettingsStore } from '../../src/settings/settingsStore.js';

let dir: string;
let db: Kysely<Schema>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'announcord-backup-'));
  db = openDatabase(join(dir, 'announcord.sqlite'));
  await migrate(db);
});

afterEach(async () => {
  await db.destroy();
  await rm(dir, { recursive: true, force: true });
});

describe('backupDatabase', () => {
  it('copies writes still in the WAL while the database is open', async () => {
    await new SettingsStore(db).updateGuild('g1', { voiceId: 'Joanna' });

    const dest = join(dir, 'backups', 'copy.sqlite');
    await backupDatabase(join(dir, 'announcord.sqlite'), dest);

    const copy = new Database(dest, { readonly: true });
    try {
      expect(copy.prepare('select voice_id from guilds where guild_id = ?').get('g1')).toEqual({
        voice_id: 'Joanna',
      });
    } finally {
      copy.close();
    }
  });

  it('explains a missing source instead of a bare SQLite error', async () => {
    const missing = join(dir, 'missing.sqlite');
    await expect(backupDatabase(missing, join(dir, 'copy.sqlite'))).rejects.toThrow(
      `No database at ${missing}. Has the bot run with this DATA_DIR yet?`,
    );
  });
});

describe('backupFileName', () => {
  it('stamps the UTC time in a filename-safe form', () => {
    expect(backupFileName(new Date('2026-10-02T20:15:07.123Z'))).toBe(
      'announcord-2026-10-02T20-15-07Z.sqlite',
    );
  });
});
