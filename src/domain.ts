export type AnnounceStyle = 'join' | 'exit' | 'both';
export type ChannelRule = 'allow' | 'deny';

export interface GuildSettings {
  guildId: string;
  style: AnnounceStyle;
  ignoreEmpty: boolean;
  provider: string;
  voiceId: string;
  /** null means the built-in default text. */
  enterTemplate: string | null;
  exitTemplate: string | null;
  /** Whether members may hide themselves with /announce sneak. */
  sneakingAllowed: boolean;
}

export interface MemberOverride {
  voiceId: string | null;
  enterTemplate: string | null;
  exitTemplate: string | null;
  pronunciation: string | null;
  /** The member chose not to be announced; honoured only while sneaking is allowed. */
  sneak: boolean;
  /** An admin turned this member's announcements off; the member cannot undo it. */
  silenced: boolean;
}

export interface VoiceEvent {
  type: 'join' | 'exit' | 'move';
  guildId: string;
  userId: string;
  /** Candidate spoken names, best first: nickname, global display name, username. */
  names: string[];
  fromChannelId: string | null;
  toChannelId: string | null;
}

export interface Announcement {
  guildId: string;
  channelId: string;
  text: string;
  voiceId: string;
  kind: 'enter' | 'exit';
}

export const DEFAULTS = {
  style: 'both',
  ignoreEmpty: true,
  provider: 'polly',
  voiceId: 'Matthew',
  enterTemplate: '%name has entered the channel',
  exitTemplate: '%name has left the channel',
  sneakingAllowed: true,
} as const satisfies Omit<GuildSettings, 'guildId'>;
