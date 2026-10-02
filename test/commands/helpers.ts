import type { Kysely } from 'kysely';
import type { Caller, CommandDeps } from '../../src/commands/shared.js';
import { migrate, openDatabase, type Schema } from '../../src/settings/db.js';
import { SettingsStore } from '../../src/settings/settingsStore.js';
import type { Voice } from '../../src/tts/provider.js';
import { UsageMeter } from '../../src/tts/usageMeter.js';

export const VOICES: Voice[] = [
  { id: 'Joanna', name: 'Joanna', languageCode: 'en-US', languageName: 'US English' },
  { id: 'Lucia', name: 'Lucia', languageCode: 'es-ES', languageName: 'Castilian Spanish' },
  { id: 'Matthew', name: 'Matthew', languageCode: 'en-US', languageName: 'US English' },
];

export interface Harness {
  db: Kysely<Schema>;
  deps: CommandDeps;
  /** Guild ids for which speech is enabled. */
  enabled: Set<string>;
  voices: Voice[];
}

export async function createHarness(): Promise<Harness> {
  const db = openDatabase(':memory:');
  await migrate(db);
  const harness: Harness = {
    db,
    enabled: new Set(['g1']),
    voices: [...VOICES],
    deps: {
      store: new SettingsStore(db),
      meter: new UsageMeter(db),
      tts: {
        voices: async () => harness.voices,
        findVoice: async (idOrName) =>
          harness.voices.find((v) => v.id.toLowerCase() === idOrName.trim().toLowerCase()) ?? null,
        isEnabledFor: (guildId) => harness.enabled.has(guildId),
      },
    },
  };
  return harness;
}

export const caller: Caller = {
  guildId: 'g1',
  userId: 'u1',
  names: ['Mando', 'alocay'],
  voiceChannelId: null,
};
