import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrations } from './migrations.js';

export interface GuildsTable {
  guild_id: string;
  style: string;
  /** 0 or 1; an integer so the schema reads the same on SQLite and Postgres. */
  ignore_empty: number;
  provider: string;
  voice_id: string;
  enter_template: string | null;
  exit_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberOverridesTable {
  guild_id: string;
  user_id: string;
  voice_id: string | null;
  enter_template: string | null;
  exit_template: string | null;
  pronunciation: string | null;
  updated_at: string;
  updated_by: string;
}

export interface ChannelRulesTable {
  guild_id: string;
  channel_id: string;
  rule: string;
}

export interface UsageTable {
  guild_id: string;
  /** YYYY-MM in UTC. */
  month: string;
  provider: string;
  chars: number;
}

export interface Schema {
  guilds: GuildsTable;
  member_overrides: MemberOverridesTable;
  channel_rules: ChannelRulesTable;
  usage: UsageTable;
}

/** Opens (creating if needed) the SQLite database. Pass ':memory:' in tests. */
export function openDatabase(file: string): Kysely<Schema> {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return new Kysely<Schema>({ dialect: new SqliteDialect({ database: sqlite }) });
}

export async function migrate(db: Kysely<Schema>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
