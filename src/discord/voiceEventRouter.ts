import type { VoiceEvent } from '../domain.js';

export interface RawVoiceChange {
  guildId: string;
  userId: string;
  isBot: boolean;
  names: string[];
  oldChannelId: string | null;
  newChannelId: string | null;
  afkChannelId: string | null;
}

/**
 * Classifies a voice state change. The AFK channel counts as "not in voice",
 * so going AFK is an exit and coming back is a join.
 */
export function routeVoiceChange(raw: RawVoiceChange): VoiceEvent | null {
  if (raw.isBot) return null;

  const from = raw.oldChannelId === raw.afkChannelId ? null : raw.oldChannelId;
  const to = raw.newChannelId === raw.afkChannelId ? null : raw.newChannelId;
  if (from === to) return null;

  const type = from && to ? 'move' : to ? 'join' : 'exit';
  return {
    type,
    guildId: raw.guildId,
    userId: raw.userId,
    names: raw.names,
    fromChannelId: from,
    toChannelId: to,
  };
}
