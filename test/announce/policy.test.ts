import { describe, expect, it } from 'vitest';
import {
  decideAnnouncements,
  mutedReason,
  renderText,
  resolveName,
  type PolicyInput,
} from '../../src/announce/policy.js';
import type { ChannelRule, GuildSettings, MemberOverride, VoiceEvent } from '../../src/domain.js';

const settings: GuildSettings = {
  guildId: 'g1',
  style: 'both',
  ignoreEmpty: true,
  provider: 'polly',
  voiceId: 'Matthew',
  enterTemplate: null,
  exitTemplate: null,
  sneakingAllowed: true,
};

const noOverride: MemberOverride = {
  voiceId: null,
  enterTemplate: null,
  exitTemplate: null,
  pronunciation: null,
  sneak: false,
  silenced: false,
};

function event(overrides: Partial<VoiceEvent>): VoiceEvent {
  return {
    type: 'join',
    guildId: 'g1',
    userId: 'u1',
    names: ['Armando'],
    fromChannelId: null,
    toChannelId: 'a',
    ...overrides,
  };
}

const join = event({});
const exit = event({ type: 'exit', fromChannelId: 'a', toChannelId: null });
const move = event({ type: 'move', fromChannelId: 'a', toChannelId: 'b' });

function input(overrides: Partial<PolicyInput> & { humans?: Record<string, number> }): PolicyInput {
  const { humans = { a: 1, b: 1 }, ...rest } = overrides;
  return {
    event: join,
    settings,
    override: null,
    rules: new Map<string, ChannelRule>(),
    otherHumansIn: (channelId) => humans[channelId] ?? 0,
    botChannelId: null,
    ...rest,
  };
}

describe('decideAnnouncements', () => {
  it('announces a join with the default text and guild voice', () => {
    expect(decideAnnouncements(input({}))).toEqual([
      {
        guildId: 'g1',
        channelId: 'a',
        text: 'Armando has entered the channel',
        voiceId: 'Matthew',
        kind: 'enter',
      },
    ]);
  });

  it('announces an exit in the channel that was left', () => {
    expect(decideAnnouncements(input({ event: exit }))).toMatchObject([
      { channelId: 'a', text: 'Armando has left the channel', kind: 'exit' },
    ]);
  });

  describe('style', () => {
    it('"join" suppresses exits', () => {
      const s = { ...settings, style: 'join' as const };
      expect(decideAnnouncements(input({ settings: s, event: exit }))).toEqual([]);
      expect(decideAnnouncements(input({ settings: s, event: join }))).toHaveLength(1);
    });

    it('"exit" suppresses joins', () => {
      const s = { ...settings, style: 'exit' as const };
      expect(decideAnnouncements(input({ settings: s, event: join }))).toEqual([]);
      expect(decideAnnouncements(input({ settings: s, event: exit }))).toHaveLength(1);
    });
  });

  describe('ignore-empty', () => {
    it('skips a join into a channel with nobody else in it', () => {
      expect(decideAnnouncements(input({ humans: { a: 0 } }))).toEqual([]);
    });

    it('announces a join into an empty channel when turned off', () => {
      const s = { ...settings, ignoreEmpty: false };
      expect(decideAnnouncements(input({ settings: s, humans: { a: 0 } }))).toHaveLength(1);
    });

    it('never announces an exit to a channel left empty, even when turned off', () => {
      const s = { ...settings, ignoreEmpty: false };
      expect(decideAnnouncements(input({ settings: s, event: exit, humans: { a: 0 } }))).toEqual(
        [],
      );
    });
  });

  describe('channel rules', () => {
    it('skips a denied channel', () => {
      const rules = new Map<string, ChannelRule>([['a', 'deny']]);
      expect(decideAnnouncements(input({ rules }))).toEqual([]);
    });

    it('announces only in allowed channels once any allow rule exists', () => {
      const rules = new Map<string, ChannelRule>([['b', 'allow']]);
      expect(decideAnnouncements(input({ rules }))).toEqual([]);
      expect(
        decideAnnouncements(input({ rules, event: event({ toChannelId: 'b' }) })),
      ).toHaveLength(1);
    });

    it('treats unlisted channels as excluded when allow and deny rules coexist', () => {
      const rules = new Map<string, ChannelRule>([
        ['a', 'allow'],
        ['b', 'deny'],
      ]);
      const inC = event({ toChannelId: 'c' });
      expect(decideAnnouncements(input({ rules, event: inC, humans: { c: 2 } }))).toEqual([]);
      expect(decideAnnouncements(input({ rules }))).toHaveLength(1);
    });
  });

  describe('move', () => {
    it('announces the join first by default, then the exit', () => {
      expect(decideAnnouncements(input({ event: move }))).toMatchObject([
        { channelId: 'b', kind: 'enter' },
        { channelId: 'a', kind: 'exit' },
      ]);
    });

    it('announces the exit first when the bot is already in the channel being left', () => {
      expect(decideAnnouncements(input({ event: move, botChannelId: 'a' }))).toMatchObject([
        { channelId: 'a', kind: 'exit' },
        { channelId: 'b', kind: 'enter' },
      ]);
    });

    it('produces only the permitted side when one channel is denied', () => {
      const rules = new Map<string, ChannelRule>([['a', 'deny']]);
      expect(decideAnnouncements(input({ event: move, rules }))).toMatchObject([
        { channelId: 'b', kind: 'enter' },
      ]);
    });
  });

  describe('sneak and silence', () => {
    const sneaking = { ...noOverride, sneak: true };
    const silenced = { ...noOverride, silenced: true };

    it('never announces a silenced member, joining, leaving or moving', () => {
      for (const e of [join, exit, move]) {
        expect(decideAnnouncements(input({ event: e, override: silenced }))).toEqual([]);
      }
    });

    it('keeps a member silenced even when sneaking is not allowed', () => {
      const s = { ...settings, sneakingAllowed: false };
      expect(decideAnnouncements(input({ settings: s, override: silenced }))).toEqual([]);
    });

    it('does not announce a sneaking member while sneaking is allowed', () => {
      for (const e of [join, exit, move]) {
        expect(decideAnnouncements(input({ event: e, override: sneaking }))).toEqual([]);
      }
    });

    it('announces a sneaking member once the server disallows sneaking', () => {
      const s = { ...settings, sneakingAllowed: false };
      expect(decideAnnouncements(input({ settings: s, override: sneaking }))).toHaveLength(1);
    });
  });

  describe('mutedReason', () => {
    it('reports silence first, then sneak, then nothing', () => {
      expect(mutedReason(settings, { ...noOverride, silenced: true, sneak: true })).toBe(
        'silenced',
      );
      expect(mutedReason(settings, { ...noOverride, sneak: true })).toBe('sneaking');
      expect(mutedReason({ ...settings, sneakingAllowed: false }, { ...noOverride, sneak: true })).toBeNull();
      expect(mutedReason(settings, null)).toBeNull();
    });
  });

  describe('overrides', () => {
    it('prefers the guild template over the built-in default', () => {
      const s = { ...settings, enterTemplate: 'Look, %name!' };
      expect(decideAnnouncements(input({ settings: s }))[0]?.text).toBe('Look, Armando!');
    });

    it('prefers the member template over the guild template', () => {
      const s = { ...settings, enterTemplate: 'Look, %name!' };
      const override = { ...noOverride, enterTemplate: 'The boss is here' };
      expect(decideAnnouncements(input({ settings: s, override }))[0]?.text).toBe(
        'The boss is here',
      );
    });

    it('uses the member exit template only for exits', () => {
      const override = { ...noOverride, exitTemplate: '%name out' };
      expect(decideAnnouncements(input({ override }))[0]?.text).toBe(
        'Armando has entered the channel',
      );
      expect(decideAnnouncements(input({ override, event: exit }))[0]?.text).toBe('Armando out');
    });

    it('prefers the member voice over the guild voice', () => {
      const override = { ...noOverride, voiceId: 'Joanna' };
      expect(decideAnnouncements(input({ override }))[0]?.voiceId).toBe('Joanna');
    });

    it('speaks the member pronunciation instead of the display name', () => {
      const override = { ...noOverride, pronunciation: 'Ar-mahn-doe' };
      expect(decideAnnouncements(input({ override }))[0]?.text).toBe(
        'Ar-mahn-doe has entered the channel',
      );
    });
  });
});

describe('renderText', () => {
  it('replaces every occurrence of %name', () => {
    expect(renderText('%name! %name is here', 'Bo')).toBe('Bo! Bo is here');
  });

  it('inserts replacement patterns in a name literally', () => {
    expect(renderText('%name has entered', '$& $1 $$')).toBe('$& $1 $$ has entered');
  });

  it('does not substitute again inside an inserted name', () => {
    expect(renderText('%name joined', '%name')).toBe('%name joined');
  });
});

describe('resolveName', () => {
  it('uses the first candidate name', () => {
    expect(resolveName(['Nick', 'user'], null)).toBe('Nick');
  });

  it('prefers a pronunciation', () => {
    expect(resolveName(['Nick'], 'Nicholas')).toBe('Nicholas');
  });

  it('skips a name with nothing speakable and uses the next one', () => {
    expect(resolveName(['🔥🔥', '<:pog:1>', 'user_42'], null)).toBe('user_42');
  });

  it('falls back to "Someone" when no name is speakable', () => {
    expect(resolveName(['✨', '---'], null)).toBe('Someone');
  });

  it('strips markup from a name', () => {
    expect(resolveName(['<Tom>'], null)).toBe('Tom');
  });
});
