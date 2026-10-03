import type { Kysely } from 'kysely';
import type {
  AnnounceStyle,
  ChannelRule,
  GuildSettings,
  MemberOverride,
} from '../domain.js';
import type { GuildsTable, MemberOverridesTable, Schema } from './db.js';

/** The text settings a member can override. */
export type OverrideField = 'voiceId' | 'enterTemplate' | 'exitTemplate' | 'pronunciation';
export type OverrideFlag = 'sneak' | 'silenced';
export type GuildPatch = Partial<Omit<GuildSettings, 'guildId'>>;

const EMPTY_OVERRIDE: MemberOverride = {
  voiceId: null,
  enterTemplate: null,
  exitTemplate: null,
  pronunciation: null,
  sneak: false,
  silenced: false,
};

function isEmpty(override: MemberOverride): boolean {
  return (
    override.voiceId === null &&
    override.enterTemplate === null &&
    override.exitTemplate === null &&
    override.pronunciation === null &&
    !override.sneak &&
    !override.silenced
  );
}

function toSettings(row: GuildsTable): GuildSettings {
  return {
    guildId: row.guild_id,
    style: row.style as AnnounceStyle,
    ignoreEmpty: row.ignore_empty !== 0,
    provider: row.provider,
    voiceId: row.voice_id,
    enterTemplate: row.enter_template,
    exitTemplate: row.exit_template,
    sneakingAllowed: row.sneaking_allowed !== 0,
  };
}

function toOverride(row: MemberOverridesTable): MemberOverride {
  return {
    voiceId: row.voice_id,
    enterTemplate: row.enter_template,
    exitTemplate: row.exit_template,
    pronunciation: row.pronunciation,
    sneak: row.sneak !== 0,
    silenced: row.silenced !== 0,
  };
}

/**
 * Per-guild configuration. Reads happen on every voice event, so results are
 * held in memory and dropped whenever that guild is written to.
 */
export class SettingsStore {
  private readonly guilds = new Map<string, GuildSettings>();
  private readonly overrides = new Map<string, Map<string, MemberOverride | null>>();
  private readonly rules = new Map<string, ReadonlyMap<string, ChannelRule>>();

  constructor(private readonly db: Kysely<Schema>) {}

  async getGuild(guildId: string): Promise<GuildSettings> {
    const cached = this.guilds.get(guildId);
    if (cached) return cached;

    const now = new Date().toISOString();
    await this.db
      .insertInto('guilds')
      .values({ guild_id: guildId, created_at: now, updated_at: now } as GuildsTable)
      .onConflict((oc) => oc.column('guild_id').doNothing())
      .execute();
    const row = await this.db
      .selectFrom('guilds')
      .selectAll()
      .where('guild_id', '=', guildId)
      .executeTakeFirstOrThrow();

    const settings = toSettings(row);
    this.guilds.set(guildId, settings);
    return settings;
  }

  async updateGuild(guildId: string, patch: GuildPatch): Promise<GuildSettings> {
    await this.getGuild(guildId);

    const columns: Partial<GuildsTable> = { updated_at: new Date().toISOString() };
    if (patch.style !== undefined) columns.style = patch.style;
    if (patch.ignoreEmpty !== undefined) columns.ignore_empty = patch.ignoreEmpty ? 1 : 0;
    if (patch.provider !== undefined) columns.provider = patch.provider;
    if (patch.voiceId !== undefined) columns.voice_id = patch.voiceId;
    if (patch.enterTemplate !== undefined) columns.enter_template = patch.enterTemplate;
    if (patch.exitTemplate !== undefined) columns.exit_template = patch.exitTemplate;
    if (patch.sneakingAllowed !== undefined) {
      columns.sneaking_allowed = patch.sneakingAllowed ? 1 : 0;
    }

    await this.db.updateTable('guilds').set(columns).where('guild_id', '=', guildId).execute();
    this.guilds.delete(guildId);
    return this.getGuild(guildId);
  }

  /** Removes the guild and, by cascade, its overrides and channel rules. */
  async deleteGuild(guildId: string): Promise<void> {
    await this.db.deleteFrom('guilds').where('guild_id', '=', guildId).execute();
    this.guilds.delete(guildId);
    this.overrides.delete(guildId);
    this.rules.delete(guildId);
  }

  async getOverride(guildId: string, userId: string): Promise<MemberOverride | null> {
    const cached = this.overrides.get(guildId)?.get(userId);
    if (cached !== undefined) return cached;

    const row = await this.db
      .selectFrom('member_overrides')
      .selectAll()
      .where('guild_id', '=', guildId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const override = row ? toOverride(row) : null;
    let guildCache = this.overrides.get(guildId);
    if (!guildCache) {
      guildCache = new Map();
      this.overrides.set(guildId, guildCache);
    }
    guildCache.set(userId, override);
    return override;
  }

  async setOverrideField(
    guildId: string,
    userId: string,
    field: OverrideField,
    value: string | null,
    updatedBy: string,
  ): Promise<void> {
    await this.changeOverride(guildId, userId, { [field]: value }, updatedBy);
  }

  async setFlag(
    guildId: string,
    userId: string,
    flag: OverrideFlag,
    value: boolean,
    updatedBy: string,
  ): Promise<void> {
    await this.changeOverride(guildId, userId, { [flag]: value }, updatedBy);
  }

  /**
   * Removes everything a member set for themselves, including sneak. An
   * admin's silence is kept: only the silence command lifts it. Returns false
   * when there was nothing to remove.
   */
  async clearOverride(guildId: string, userId: string): Promise<boolean> {
    const current = await this.getOverride(guildId, userId);
    if (!current) return false;

    const cleared: MemberOverride = { ...EMPTY_OVERRIDE, silenced: current.silenced };
    if (isEmpty({ ...current, silenced: false })) return false;
    await this.writeOverride(guildId, userId, cleared, null);
    return true;
  }

  /** User ids of the guild's silenced members. */
  async getSilenced(guildId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('member_overrides')
      .select('user_id')
      .where('guild_id', '=', guildId)
      .where('silenced', '=', 1)
      .orderBy('user_id')
      .execute();
    return rows.map((r) => r.user_id);
  }

  private async changeOverride(
    guildId: string,
    userId: string,
    change: Partial<MemberOverride>,
    updatedBy: string,
  ): Promise<void> {
    const current = await this.getOverride(guildId, userId);
    await this.writeOverride(guildId, userId, { ...(current ?? EMPTY_OVERRIDE), ...change }, updatedBy);
  }

  /**
   * Stores the member's complete override, or deletes the row when nothing is
   * left in it. `updatedBy` null keeps the previous author (used by clearing).
   */
  private async writeOverride(
    guildId: string,
    userId: string,
    next: MemberOverride,
    updatedBy: string | null,
  ): Promise<void> {
    this.overrides.get(guildId)?.delete(userId);

    if (isEmpty(next)) {
      await this.db
        .deleteFrom('member_overrides')
        .where('guild_id', '=', guildId)
        .where('user_id', '=', userId)
        .execute();
      return;
    }

    await this.getGuild(guildId);
    const updated_at = new Date().toISOString();
    const columns = {
      voice_id: next.voiceId,
      enter_template: next.enterTemplate,
      exit_template: next.exitTemplate,
      pronunciation: next.pronunciation,
      sneak: next.sneak ? 1 : 0,
      silenced: next.silenced ? 1 : 0,
      updated_at,
    };
    await this.db
      .insertInto('member_overrides')
      .values({
        guild_id: guildId,
        user_id: userId,
        ...columns,
        updated_by: updatedBy ?? userId,
      })
      .onConflict((oc) =>
        oc
          .columns(['guild_id', 'user_id'])
          .doUpdateSet(updatedBy ? { ...columns, updated_by: updatedBy } : columns),
      )
      .execute();
  }

  async getRules(guildId: string): Promise<ReadonlyMap<string, ChannelRule>> {
    const cached = this.rules.get(guildId);
    if (cached) return cached;

    const rows = await this.db
      .selectFrom('channel_rules')
      .select(['channel_id', 'rule'])
      .where('guild_id', '=', guildId)
      .orderBy('channel_id')
      .execute();

    const rules = new Map(rows.map((r) => [r.channel_id, r.rule as ChannelRule]));
    this.rules.set(guildId, rules);
    return rules;
  }

  async setRule(guildId: string, channelId: string, rule: ChannelRule): Promise<void> {
    await this.getGuild(guildId);
    await this.db
      .insertInto('channel_rules')
      .values({ guild_id: guildId, channel_id: channelId, rule })
      .onConflict((oc) => oc.columns(['guild_id', 'channel_id']).doUpdateSet({ rule }))
      .execute();
    this.rules.delete(guildId);
  }

  async removeRule(guildId: string, channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('channel_rules')
      .where('guild_id', '=', guildId)
      .where('channel_id', '=', channelId)
      .executeTakeFirst();
    this.rules.delete(guildId);
    return result.numDeletedRows > 0n;
  }
}
