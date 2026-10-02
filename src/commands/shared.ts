import { renderText, resolveName } from '../announce/policy.js';
import { DEFAULTS, type Announcement } from '../domain.js';
import type { OverrideField, SettingsStore } from '../settings/settingsStore.js';
import type { TtsService } from '../tts/ttsService.js';
import type { UsageMeter } from '../tts/usageMeter.js';
import { validatePronunciation, validateTemplate } from './validation.js';

export interface CommandDeps {
  store: SettingsStore;
  meter: UsageMeter;
  tts: Pick<TtsService, 'voices' | 'findVoice' | 'isEnabledFor'>;
}

/** The member who ran a command. */
export interface Caller {
  guildId: string;
  userId: string;
  /** Candidate spoken names, best first. */
  names: string[];
  voiceChannelId: string | null;
}

export interface CommandResult {
  reply: string;
  /** Something to say aloud as well, when the command asks for it. */
  speak?: Announcement;
}

/** The personal settings as they are named in the slash commands. */
export type FieldChoice = 'voice' | 'enter' | 'exit' | 'pronounce';

export const FIELDS: Record<FieldChoice, { column: OverrideField; label: string }> = {
  voice: { column: 'voiceId', label: 'voice' },
  enter: { column: 'enterTemplate', label: 'enter message' },
  exit: { column: 'exitTemplate', label: 'exit message' },
  pronounce: { column: 'pronunciation', label: 'pronunciation' },
};

export const SPEECH_DISABLED_NOTE =
  'Speech is not enabled for this server yet, so nothing will be said aloud. Settings are still saved.';

export type SetOverrideResult = { ok: true; value: string } | { ok: false; error: string };

/** Validates and stores one personal setting for a member. */
export async function setOverride(
  deps: CommandDeps,
  guildId: string,
  targetId: string,
  field: FieldChoice,
  raw: string,
  updatedBy: string,
): Promise<SetOverrideResult> {
  let value: string;
  if (field === 'voice') {
    const voice = await deps.tts.findVoice(raw);
    if (!voice) {
      return {
        ok: false,
        error: `There is no voice named \`${raw.replace(/`/g, '')}\`. Use \`/announce voices\` to see the list.`,
      };
    }
    value = voice.id;
  } else {
    const checked = field === 'pronounce' ? validatePronunciation(raw) : validateTemplate(raw);
    if (!checked.ok) return checked;
    value = checked.value;
  }

  await deps.store.setOverrideField(guildId, targetId, FIELDS[field].column, value, updatedBy);
  return { ok: true, value };
}

/** Removes one or all personal settings. Returns false if nothing was stored. */
export async function clearOverrideField(
  deps: CommandDeps,
  guildId: string,
  targetId: string,
  field: FieldChoice | 'all',
  updatedBy: string,
): Promise<boolean> {
  if (field === 'all') return deps.store.clearOverride(guildId, targetId);

  const current = await deps.store.getOverride(guildId, targetId);
  const column = FIELDS[field].column;
  if (!current || current[column] === null) return false;
  await deps.store.setOverrideField(guildId, targetId, column, null, updatedBy);
  return true;
}

export interface Spoken {
  enter: string;
  exit: string;
  voiceId: string;
}

/** What would be said for this member right now, given every setting in play. */
export async function spokenFor(
  deps: CommandDeps,
  guildId: string,
  userId: string,
  names: string[],
): Promise<Spoken> {
  const [settings, override] = await Promise.all([
    deps.store.getGuild(guildId),
    deps.store.getOverride(guildId, userId),
  ]);
  const name = resolveName(names, override?.pronunciation ?? null);
  return {
    enter: renderText(
      override?.enterTemplate ?? settings.enterTemplate ?? DEFAULTS.enterTemplate,
      name,
    ),
    exit: renderText(override?.exitTemplate ?? settings.exitTemplate ?? DEFAULTS.exitTemplate, name),
    voiceId: override?.voiceId ?? settings.voiceId,
  };
}
