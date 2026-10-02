import type { Interaction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerRegistry } from '../../src/announce/announcerRegistry.js';
import type { GuildAnnouncer } from '../../src/announce/guildAnnouncer.js';
import { handleInteraction, type DispatcherDeps } from '../../src/commands/dispatcher.js';
import type { Announcement } from '../../src/domain.js';
import { silentLogger } from '../../src/logger.js';
import { createHarness, type Harness } from './helpers.js';

interface Reply {
  content?: string;
  flags?: number;
  components?: unknown[];
  allowedMentions?: unknown;
}

function fakeMember(id: string, nickname: string | null, voiceChannelId: string | null = null) {
  return {
    id,
    nickname,
    displayName: nickname ?? `user_${id}`,
    user: { id, username: `user_${id}`, globalName: null },
    voice: { channelId: voiceChannelId },
  };
}

const fakeGuild = {
  id: 'g1',
  channels: { cache: new Map<string, { name: string }>([['c7', { name: 'lobby' }]]) },
};

interface ChatOptions {
  group?: string;
  sub: string;
  values?: Record<string, unknown>;
  userId?: string;
  voiceChannelId?: string | null;
}

function chat(commandName: string, options: ChatOptions) {
  const replies: Reply[] = [];
  const userId = options.userId ?? 'u1';
  const values = options.values ?? {};
  const interaction = {
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isButton: () => false,
    isRepliable: () => true,
    inCachedGuild: () => true,
    commandName,
    guildId: 'g1',
    guild: fakeGuild,
    user: { id: userId },
    member: fakeMember(userId, 'Mando', options.voiceChannelId ?? null),
    replied: false,
    options: {
      getSubcommandGroup: () => options.group ?? null,
      getSubcommand: () => options.sub,
      getString: (name: string) => (values[name] as string | undefined) ?? null,
      getBoolean: (name: string) => (values[name] as boolean | undefined) ?? null,
      getChannel: (name: string) => values[name] ?? null,
      getUser: (name: string) => (values[name] as { user: unknown } | undefined)?.user ?? null,
      getMember: (name: string) => values[name] ?? null,
    },
    reply: async (payload: Reply) => {
      interaction.replied = true;
      replies.push(payload);
    },
    followUp: async (payload: Reply) => {
      replies.push(payload);
    },
  };
  return { interaction: interaction as unknown as Interaction, replies };
}

function button(customId: string, userId = 'u1') {
  const updates: Reply[] = [];
  const replies: Reply[] = [];
  const interaction = {
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isRepliable: () => true,
    inCachedGuild: () => true,
    customId,
    guildId: 'g1',
    guild: fakeGuild,
    user: { id: userId },
    member: fakeMember(userId, 'Mando'),
    replied: false,
    update: async (payload: Reply) => {
      updates.push(payload);
    },
    reply: async (payload: Reply) => {
      replies.push(payload);
    },
  };
  return { interaction: interaction as unknown as Interaction, updates, replies };
}

function autocomplete(typed: string) {
  const responses: Array<Array<{ name: string; value: string }>> = [];
  const interaction = {
    isAutocomplete: () => true,
    isChatInputCommand: () => false,
    isButton: () => false,
    isRepliable: () => true,
    inCachedGuild: () => true,
    guildId: 'g1',
    options: { getFocused: () => typed },
    respond: async (choices: Array<{ name: string; value: string }>) => {
      responses.push(choices);
    },
  };
  return { interaction: interaction as unknown as Interaction, responses };
}

/** Pulls the custom ids out of a reply's button row. */
function customIds(reply: Reply | undefined): string[] {
  const rows = (reply?.components ?? []) as Array<{
    toJSON(): { components: Array<{ custom_id: string }> };
  }>;
  return rows.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));
}

let h: Harness;
let deps: DispatcherDeps;
let enqueued: Announcement[];

beforeEach(async () => {
  h = await createHarness();
  enqueued = [];
  const announcer = { enqueue: (a: Announcement) => enqueued.push(a) };
  deps = {
    ...h.deps,
    registry: new AnnouncerRegistry(() => announcer as unknown as GuildAnnouncer),
    joinWarnings: () => [],
    log: silentLogger,
  };
});

afterEach(async () => {
  await h.db.destroy();
});

describe('handleInteraction: slash commands', () => {
  it('runs /announce for the caller and replies privately without pinging anyone', async () => {
    const { interaction, replies } = chat('announce', {
      sub: 'pronounce',
      values: { text: 'Mondo' },
    });

    await handleInteraction(interaction, deps);

    expect((await h.deps.store.getOverride('g1', 'u1'))?.pronunciation).toBe('Mondo');
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      content: expect.stringContaining('Mondo'),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  });

  it('speaks the preview in the caller’s voice channel', async () => {
    const { interaction } = chat('announce', { sub: 'preview', voiceChannelId: 'c9' });

    await handleInteraction(interaction, deps);

    expect(enqueued).toMatchObject([{ channelId: 'c9', text: 'Mando has entered the channel' }]);
  });

  it('routes /announce-admin channel subcommands with the chosen channel', async () => {
    const { interaction } = chat('announce-admin', {
      group: 'channel',
      sub: 'deny',
      values: { channel: { id: 'c7', name: 'lobby' } },
    });

    await handleInteraction(interaction, deps);

    expect([...(await h.deps.store.getRules('g1'))]).toEqual([['c7', 'deny']]);
  });

  it('routes /announce-admin user set to the chosen member, authored by the caller', async () => {
    const { interaction, replies } = chat('announce-admin', {
      group: 'user',
      sub: 'set',
      userId: 'admin1',
      values: { member: fakeMember('u2', 'Friend'), field: 'voice', value: 'Joanna' },
    });

    await handleInteraction(interaction, deps);

    expect((await h.deps.store.getOverride('g1', 'u2'))?.voiceId).toBe('Joanna');
    expect(await h.deps.store.getOverride('g1', 'admin1')).toBeNull();
    expect(replies[0]?.content).toContain('Friend');
  });

  it('shows channel names and permission warnings in settings', async () => {
    await h.deps.store.setRule('g1', 'c7', 'deny');
    deps.joinWarnings = () => ['lobby: missing Speak permission'];
    const { interaction, replies } = chat('announce-admin', { sub: 'settings' });

    await handleInteraction(interaction, deps);

    expect(replies[0]?.content).toContain('Denied channels: lobby');
    expect(replies[0]?.content).toContain('lobby: missing Speak permission');
  });

  it('answers with a generic error and a reference when a command fails', async () => {
    const { interaction, replies } = chat('announce', { sub: 'show' });
    await h.db.destroy(); // every store call now fails

    await handleInteraction(interaction, deps);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(replies[0]?.content).toMatch(/something went wrong.*ref [0-9a-f]{8}/i);

    h = await createHarness(); // so afterEach has a live database to close
  });
});

describe('handleInteraction: reset confirmation', () => {
  beforeEach(async () => {
    await h.deps.store.updateGuild('g1', { style: 'exit' });
  });

  it('asks for confirmation instead of resetting straight away', async () => {
    const { interaction, replies } = chat('announce-admin', { sub: 'reset' });

    await handleInteraction(interaction, deps);

    expect((await h.deps.store.getGuild('g1')).style).toBe('exit');
    expect(customIds(replies[0])).toHaveLength(2);
  });

  it('resets when the same member confirms', async () => {
    const asked = chat('announce-admin', { sub: 'reset' });
    await handleInteraction(asked.interaction, deps);
    const [confirmId] = customIds(asked.replies[0]);

    const pressed = button(confirmId!);
    await handleInteraction(pressed.interaction, deps);

    expect((await h.deps.store.getGuild('g1')).style).toBe('both');
    expect(pressed.updates[0]).toMatchObject({ components: [] });
  });

  it('keeps the settings when the member cancels', async () => {
    const asked = chat('announce-admin', { sub: 'reset' });
    await handleInteraction(asked.interaction, deps);
    const [, cancelId] = customIds(asked.replies[0]);

    const pressed = button(cancelId!);
    await handleInteraction(pressed.interaction, deps);

    expect((await h.deps.store.getGuild('g1')).style).toBe('exit');
    expect(pressed.updates[0]).toMatchObject({ components: [] });
  });

  it('refuses a confirmation pressed by a different member', async () => {
    const asked = chat('announce-admin', { sub: 'reset' });
    await handleInteraction(asked.interaction, deps);
    const [confirmId] = customIds(asked.replies[0]);

    const pressed = button(confirmId!, 'intruder');
    await handleInteraction(pressed.interaction, deps);

    expect((await h.deps.store.getGuild('g1')).style).toBe('exit');
    expect(pressed.updates).toEqual([]);
  });
});

describe('handleInteraction: voice autocomplete', () => {
  it('suggests voices matching what was typed, by name or language', async () => {
    const byName = autocomplete('jo');
    const byLanguage = autocomplete('spanish');

    await handleInteraction(byName.interaction, deps);
    await handleInteraction(byLanguage.interaction, deps);

    expect(byName.responses[0]?.map((c) => c.value)).toEqual(['Joanna']);
    expect(byLanguage.responses[0]?.map((c) => c.value)).toEqual(['Lucia']);
  });

  it('never offers more than Discord’s limit of 25 choices', async () => {
    h.voices = Array.from({ length: 60 }, (_, i) => ({
      id: `Voice${i}`,
      name: `Voice${i}`,
      languageCode: 'en-US',
      languageName: 'US English',
    }));
    const { interaction, responses } = autocomplete('');

    await handleInteraction(interaction, deps);

    expect(responses[0]).toHaveLength(25);
  });

  it('answers with no choices rather than failing when voices cannot be loaded', async () => {
    deps.tts = { ...deps.tts, voices: async () => Promise.reject(new Error('polly down')) };
    const { interaction, responses } = autocomplete('jo');

    await handleInteraction(interaction, deps);

    expect(responses).toEqual([[]]);
  });
});
