import { channelPermitted, resolveName } from '../announce/policy.js';
import { DEFAULTS } from '../domain.js';
import type { Voice } from '../tts/provider.js';
import {
  clearOverrideField,
  FIELDS,
  setOverride,
  SPEECH_DISABLED_NOTE,
  spokenFor,
  type Caller,
  type CommandDeps,
  type CommandResult,
  type FieldChoice,
} from './shared.js';

export type AnnounceRequest =
  | { sub: 'voice'; voice: string }
  | { sub: 'enter' | 'exit' | 'pronounce'; text: string }
  | { sub: 'clear'; field: FieldChoice | 'all' }
  | { sub: 'show' }
  | { sub: 'preview' }
  | { sub: 'voices'; language?: string };

// Discord rejects messages over 2000 characters; leave room for the footer.
const VOICE_LIST_BUDGET = 1800;

/** Runs a `/announce` subcommand. It only ever affects the caller. */
export async function runAnnounce(
  req: AnnounceRequest,
  caller: Caller,
  deps: CommandDeps,
): Promise<CommandResult> {
  const { guildId, userId } = caller;

  switch (req.sub) {
    case 'voice':
    case 'enter':
    case 'exit':
    case 'pronounce': {
      const raw = req.sub === 'voice' ? req.voice : req.text;
      const result = await setOverride(deps, guildId, userId, req.sub, raw, userId);
      if (!result.ok) return { reply: result.error };
      return { reply: `Your ${FIELDS[req.sub].label} is now: **${result.value}**` };
    }

    case 'clear': {
      const removed = await clearOverrideField(deps, guildId, userId, req.field, userId);
      if (!removed) {
        return {
          reply:
            req.field === 'all'
              ? 'You have no personal settings to remove.'
              : `You have no personal settings for your ${FIELDS[req.field].label}.`,
        };
      }
      return {
        reply:
          req.field === 'all'
            ? 'Removed all of your personal settings.'
            : `Removed your ${FIELDS[req.field].label}.`,
      };
    }

    case 'show': {
      const [settings, override, spoken] = await Promise.all([
        deps.store.getGuild(guildId),
        deps.store.getOverride(guildId, userId),
        spokenFor(deps, guildId, userId, caller.names),
      ]);
      // Show the value actually in effect, and say where it comes from when
      // it is not the member's own.
      const effective = (own: string | null | undefined, fallback: string, source: string) =>
        own ?? `${fallback} *(${source})*`;
      return {
        reply: [
          '**Your personal settings**',
          `Voice: ${effective(override?.voiceId, settings.voiceId, 'server default')}`,
          `Enter message: ${effective(
            override?.enterTemplate,
            settings.enterTemplate ?? DEFAULTS.enterTemplate,
            'server default',
          )}`,
          `Exit message: ${effective(
            override?.exitTemplate,
            settings.exitTemplate ?? DEFAULTS.exitTemplate,
            'server default',
          )}`,
          `Pronunciation: ${effective(
            override?.pronunciation,
            resolveName(caller.names, null),
            'your display name',
          )}`,
          '',
          `**What will be said** (voice: ${spoken.voiceId})`,
          `Joining: “${spoken.enter}”`,
          `Leaving: “${spoken.exit}”`,
        ].join('\n'),
      };
    }

    case 'preview': {
      const spoken = await spokenFor(deps, guildId, userId, caller.names);
      const lines = [
        `Joining: “${spoken.enter}”`,
        `Leaving: “${spoken.exit}”`,
        `Voice: ${spoken.voiceId}`,
        '',
      ];
      if (!deps.tts.isEnabledFor(guildId)) {
        return { reply: [...lines, SPEECH_DISABLED_NOTE].join('\n') };
      }
      if (!caller.voiceChannelId) {
        return { reply: [...lines, 'Join a voice channel and run this again to hear it.'].join('\n') };
      }
      // Channel rules still apply: a denied channel is one people asked to keep quiet.
      if (!channelPermitted(await deps.store.getRules(guildId), caller.voiceChannelId)) {
        return {
          reply: [
            ...lines,
            'Announcements are off in this channel, so the preview can’t play here.',
          ].join('\n'),
        };
      }
      return {
        reply: [...lines, 'Playing the join announcement in your channel.'].join('\n'),
        speak: {
          guildId,
          channelId: caller.voiceChannelId,
          text: spoken.enter,
          voiceId: spoken.voiceId,
          kind: 'enter',
        },
      };
    }

    case 'voices':
      return { reply: formatVoices(await deps.tts.voices(), req.language) };
  }
}

function formatVoices(all: Voice[], language: string | undefined): string {
  const wanted = language?.trim().toLowerCase();
  const voices = wanted
    ? all.filter(
        (v) =>
          v.languageCode.toLowerCase() === wanted || v.languageName.toLowerCase().includes(wanted),
      )
    : all;
  if (voices.length === 0) {
    return wanted
      ? `No voices found for “${language?.trim().replace(/[<>@`]/g, '')}”. Try a language code such as \`en-US\`.`
      : 'No voices are available right now.';
  }

  const byLanguage = new Map<string, string[]>();
  for (const voice of voices) {
    const heading = `${voice.languageName} (${voice.languageCode})`;
    byLanguage.set(heading, [...(byLanguage.get(heading) ?? []), voice.id]);
  }

  const lines: string[] = [];
  let length = 0;
  let shown = 0;
  for (const [heading, ids] of [...byLanguage].sort(([a], [b]) => a.localeCompare(b))) {
    const line = `**${heading}**: ${ids.sort().join(', ')}`;
    if (length + line.length + 1 > VOICE_LIST_BUDGET) break;
    lines.push(line);
    length += line.length + 1;
    shown += ids.length;
  }

  if (shown < voices.length) {
    lines.push(
      `…and ${voices.length - shown} more. Use the \`language\` option to narrow the list.`,
    );
  } else if (!wanted) {
    lines.push('Tip: use the `language` option to filter, e.g. `en-US`.');
  }
  return lines.join('\n');
}
