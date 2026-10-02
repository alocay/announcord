import { DEFAULTS, type AnnounceStyle } from '../domain.js';
import {
  clearOverrideField,
  FIELDS,
  setOverride,
  SPEECH_DISABLED_NOTE,
  type Caller,
  type CommandDeps,
  type CommandResult,
  type FieldChoice,
} from './shared.js';
import { validateTemplate } from './validation.js';

export type AdminRequest =
  | { sub: 'style'; style: AnnounceStyle }
  | { sub: 'ignore-empty'; enabled: boolean }
  | { sub: 'voice'; voice: string }
  | { sub: 'template'; kind: 'enter' | 'exit'; text: string }
  | { sub: 'channel'; action: 'allow' | 'deny' | 'unlist'; channelId: string; channelName: string }
  | { sub: 'user-set'; targetId: string; targetName: string; field: FieldChoice; value: string }
  | { sub: 'user-clear'; targetId: string; targetName: string; field: FieldChoice | 'all' }
  | { sub: 'settings'; channelName(id: string): string; warnings: string[] }
  | { sub: 'reset' };

const STYLE_LABELS: Record<AnnounceStyle, string> = {
  join: 'joins only',
  exit: 'exits only',
  both: 'joins and exits',
};

/** Runs a `/announce-admin` subcommand for the caller's guild. */
export async function runAnnounceAdmin(
  req: AdminRequest,
  caller: Caller,
  deps: CommandDeps,
): Promise<CommandResult> {
  const { guildId } = caller;
  const { store } = deps;

  switch (req.sub) {
    case 'style':
      await store.updateGuild(guildId, { style: req.style });
      return { reply: `Now announcing **${STYLE_LABELS[req.style]}**.` };

    case 'ignore-empty':
      await store.updateGuild(guildId, { ignoreEmpty: req.enabled });
      return {
        reply: req.enabled
          ? 'Announcements are skipped when nobody else is in the channel.'
          : 'Joins are announced even when nobody else is in the channel.',
      };

    case 'voice': {
      const voice = await deps.tts.findVoice(req.voice);
      if (!voice) {
        return {
          reply: `There is no voice named \`${req.voice.replace(/`/g, '')}\`. Use \`/announce voices\` to see the list.`,
        };
      }
      await store.updateGuild(guildId, { voiceId: voice.id });
      return { reply: `The server voice is now **${voice.id}** (${voice.languageName}).` };
    }

    case 'template': {
      const checked = validateTemplate(req.text);
      if (!checked.ok) return { reply: checked.error };
      await store.updateGuild(
        guildId,
        req.kind === 'enter' ? { enterTemplate: checked.value } : { exitTemplate: checked.value },
      );
      return { reply: `The server ${req.kind} message is now: **${checked.value}**` };
    }

    case 'channel': {
      if (req.action === 'unlist') {
        const removed = await store.removeRule(guildId, req.channelId);
        return {
          reply: removed
            ? `Removed the rule for **${req.channelName}**.`
            : `There is no rule for **${req.channelName}**.`,
        };
      }
      await store.setRule(guildId, req.channelId, req.action);
      return {
        reply:
          req.action === 'allow'
            ? `**${req.channelName}** is allowed. Only allowed channels are announced from now on.`
            : `**${req.channelName}** will not be announced.`,
      };
    }

    case 'user-set': {
      const result = await setOverride(
        deps,
        guildId,
        req.targetId,
        req.field,
        req.value,
        caller.userId,
      );
      if (!result.ok) return { reply: result.error };
      return {
        reply: `The ${FIELDS[req.field].label} for **${req.targetName}** is now: **${result.value}**`,
      };
    }

    case 'user-clear': {
      const removed = await clearOverrideField(
        deps,
        guildId,
        req.targetId,
        req.field,
        caller.userId,
      );
      const what = req.field === 'all' ? 'all personal settings' : `the ${FIELDS[req.field].label}`;
      return {
        reply: removed
          ? `Removed ${what} for **${req.targetName}**.`
          : `**${req.targetName}** has nothing to remove there.`,
      };
    }

    case 'settings': {
      const [settings, rules, chars] = await Promise.all([
        store.getGuild(guildId),
        store.getRules(guildId),
        deps.meter.get(guildId),
      ]);
      const named = (rule: 'allow' | 'deny') =>
        [...rules]
          .filter(([, r]) => r === rule)
          .map(([id]) => req.channelName(id))
          .join(', ') || 'none';

      const lines = [
        '**Announcement settings**',
        `Announce: ${STYLE_LABELS[settings.style]}`,
        `Ignore empty channels: ${settings.ignoreEmpty ? 'on' : 'off'}`,
        `Voice: ${settings.voiceId}`,
        `Enter message: ${settings.enterTemplate ?? DEFAULTS.enterTemplate}`,
        `Exit message: ${settings.exitTemplate ?? DEFAULTS.exitTemplate}`,
        `Allowed channels: ${named('allow')}`,
        `Denied channels: ${named('deny')}`,
        '',
        deps.tts.isEnabledFor(guildId) ? 'Speech: enabled, no limit' : SPEECH_DISABLED_NOTE,
        `Characters synthesized this month: ${chars.toLocaleString('en-US')}`,
      ];
      if (req.warnings.length > 0) {
        lines.push('', '**Warnings**', ...req.warnings.map((w) => `⚠️ ${w}`));
      }
      return { reply: lines.join('\n') };
    }

    case 'reset':
      await store.deleteGuild(guildId);
      return {
        reply: 'Settings restored to defaults. Personal settings and channel rules were removed.',
      };
  }
}
