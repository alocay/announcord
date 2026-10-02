import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { DEFAULTS } from '../domain.js';

// Migrations are defined inline (not loaded from files) so they work the same
// from source, from the compiled build and inside the container. Keys sort in
// run order. Never edit a migration that has shipped; add a new one.
export const migrations: Record<string, Migration> = {
  '0001_initial': {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('guilds')
        .addColumn('guild_id', 'text', (c) => c.primaryKey())
        .addColumn('style', 'text', (c) => c.notNull().defaultTo(DEFAULTS.style))
        .addColumn('ignore_empty', 'integer', (c) => c.notNull().defaultTo(1))
        .addColumn('provider', 'text', (c) => c.notNull().defaultTo(DEFAULTS.provider))
        .addColumn('voice_id', 'text', (c) => c.notNull().defaultTo(DEFAULTS.voiceId))
        .addColumn('enter_template', 'text')
        .addColumn('exit_template', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('member_overrides')
        .addColumn('guild_id', 'text', (c) =>
          c.notNull().references('guilds.guild_id').onDelete('cascade'),
        )
        .addColumn('user_id', 'text', (c) => c.notNull())
        .addColumn('voice_id', 'text')
        .addColumn('enter_template', 'text')
        .addColumn('exit_template', 'text')
        .addColumn('pronunciation', 'text')
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .addColumn('updated_by', 'text', (c) => c.notNull())
        .addPrimaryKeyConstraint('member_overrides_pk', ['guild_id', 'user_id'])
        .execute();

      await db.schema
        .createTable('channel_rules')
        .addColumn('guild_id', 'text', (c) =>
          c.notNull().references('guilds.guild_id').onDelete('cascade'),
        )
        .addColumn('channel_id', 'text', (c) => c.notNull())
        .addColumn('rule', 'text', (c) => c.notNull())
        .addPrimaryKeyConstraint('channel_rules_pk', ['guild_id', 'channel_id'])
        .execute();

      // Deliberately no foreign key: usage history outlives the guild row.
      await db.schema
        .createTable('usage')
        .addColumn('guild_id', 'text', (c) => c.notNull())
        .addColumn('month', 'text', (c) => c.notNull())
        .addColumn('provider', 'text', (c) => c.notNull())
        .addColumn('chars', 'integer', (c) => c.notNull().defaultTo(0))
        .addPrimaryKeyConstraint('usage_pk', ['guild_id', 'month', 'provider'])
        .execute();
    },
  },
};
