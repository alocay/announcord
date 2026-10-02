import type { Kysely } from 'kysely';
import type { Schema } from '../settings/db.js';

function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Counts characters sent for synthesis, per guild and calendar month (UTC). */
export class UsageMeter {
  constructor(
    private readonly db: Kysely<Schema>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async add(guildId: string, provider: string, chars: number): Promise<void> {
    await this.db
      .insertInto('usage')
      .values({ guild_id: guildId, month: monthOf(this.now()), provider, chars })
      .onConflict((oc) =>
        oc
          .columns(['guild_id', 'month', 'provider'])
          .doUpdateSet((eb) => ({ chars: eb('usage.chars', '+', chars) })),
      )
      .execute();
  }

  /** Characters used by the guild this month, across providers. */
  async get(guildId: string): Promise<number> {
    const row = await this.db
      .selectFrom('usage')
      .select((eb) => eb.fn.sum<number>('chars').as('total'))
      .where('guild_id', '=', guildId)
      .where('month', '=', monthOf(this.now()))
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  }
}
