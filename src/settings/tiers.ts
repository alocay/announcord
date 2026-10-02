/**
 * `unlimited` guilds always get the paid TTS provider with no quota. They are
 * named in the environment, never in the database, so the tier cannot be
 * changed by a command. `standard` guilds get quota-limited speech once the
 * free provider exists; until then they get none.
 */
export type Tier = 'unlimited' | 'standard';

export function tierOf(guildId: string, unlimited: ReadonlySet<string>): Tier {
  return unlimited.has(guildId) ? 'unlimited' : 'standard';
}
