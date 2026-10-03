import { isSpeakable, NAME_PLACEHOLDER, sanitizeSpoken } from '../commands/validation.js';
import {
  DEFAULTS,
  type Announcement,
  type ChannelRule,
  type GuildSettings,
  type MemberOverride,
  type VoiceEvent,
} from '../domain.js';

export interface PolicyInput {
  event: VoiceEvent;
  settings: GuildSettings;
  override: MemberOverride | null;
  rules: ReadonlyMap<string, ChannelRule>;
  /** Humans in the channel, not counting the member the event is about. */
  otherHumansIn(channelId: string): number;
  botChannelId: string | null;
}

const FALLBACK_NAME = 'Someone';

export function resolveName(names: string[], pronunciation: string | null): string {
  const candidates = pronunciation ? [pronunciation, ...names] : names;
  for (const candidate of candidates) {
    const cleaned = sanitizeSpoken(candidate);
    if (isSpeakable(cleaned)) return cleaned;
  }
  return FALLBACK_NAME;
}

export function renderText(template: string, name: string): string {
  // split/join inserts the name literally: no `$&` expansion, no re-substitution.
  return template.split(NAME_PLACEHOLDER).join(name);
}

/** Whether the guild's allow/deny rules let the bot speak in the channel. */
export function channelPermitted(rules: ReadonlyMap<string, ChannelRule>, channelId: string): boolean {
  const anyAllow = [...rules.values()].includes('allow');
  const rule = rules.get(channelId);
  return anyAllow ? rule === 'allow' : rule !== 'deny';
}

export type MutedReason = 'silenced' | 'sneaking';

/**
 * Why a member is not announced at all, if they are not. An admin's silence
 * always applies; a member's own sneak only while the server allows sneaking.
 */
export function mutedReason(
  settings: GuildSettings,
  override: MemberOverride | null,
): MutedReason | null {
  if (override?.silenced) return 'silenced';
  if (override?.sneak && settings.sneakingAllowed) return 'sneaking';
  return null;
}

/** Decides which announcements, in play order, a voice event should produce. */
export function decideAnnouncements(input: PolicyInput): Announcement[] {
  const { event, settings, override, rules } = input;
  if (mutedReason(settings, override)) return [];
  const name = resolveName(event.names, override?.pronunciation ?? null);
  const voiceId = override?.voiceId ?? settings.voiceId;

  const enter = (channelId: string): Announcement | null => {
    if (settings.style === 'exit') return null;
    if (!channelPermitted(rules, channelId)) return null;
    if (settings.ignoreEmpty && input.otherHumansIn(channelId) === 0) return null;
    const template = override?.enterTemplate ?? settings.enterTemplate ?? DEFAULTS.enterTemplate;
    return { guildId: event.guildId, channelId, text: renderText(template, name), voiceId, kind: 'enter' };
  };

  const exit = (channelId: string): Announcement | null => {
    if (settings.style === 'join') return null;
    if (!channelPermitted(rules, channelId)) return null;
    // Nobody is left to hear it, whatever ignore-empty says.
    if (input.otherHumansIn(channelId) === 0) return null;
    const template = override?.exitTemplate ?? settings.exitTemplate ?? DEFAULTS.exitTemplate;
    return { guildId: event.guildId, channelId, text: renderText(template, name), voiceId, kind: 'exit' };
  };

  const entered = event.toChannelId ? enter(event.toChannelId) : null;
  const exited = event.fromChannelId ? exit(event.fromChannelId) : null;

  // Play first in the channel the bot is already sitting in, to avoid hopping twice.
  const exitFirst = input.botChannelId !== null && input.botChannelId === event.fromChannelId;
  const ordered = exitFirst ? [exited, entered] : [entered, exited];
  return ordered.filter((a): a is Announcement => a !== null);
}
