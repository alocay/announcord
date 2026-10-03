import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAnnounce } from '../../src/commands/announce.js';
import { caller, createHarness, type Harness } from './helpers.js';

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  await h.db.destroy();
});

const override = () => h.deps.store.getOverride('g1', 'u1');

describe('/announce voice', () => {
  it('stores the voice under its canonical id', async () => {
    const result = await runAnnounce({ sub: 'voice', voice: 'joanna' }, caller, h.deps);

    expect((await override())?.voiceId).toBe('Joanna');
    expect(result.reply).toContain('Joanna');
  });

  it('rejects an unknown voice without changing anything', async () => {
    const result = await runAnnounce({ sub: 'voice', voice: 'Nobody' }, caller, h.deps);

    expect(await override()).toBeNull();
    expect(result.reply).toMatch(/no voice/i);
  });
});

describe('/announce enter, exit and pronounce', () => {
  it('stores a sanitized enter message', async () => {
    await runAnnounce({ sub: 'enter', text: '  <b>%name</b> is   here ' }, caller, h.deps);

    expect((await override())?.enterTemplate).toBe('b%name/b is here');
  });

  it('stores an exit message', async () => {
    await runAnnounce({ sub: 'exit', text: '%name out' }, caller, h.deps);

    expect((await override())?.exitTemplate).toBe('%name out');
  });

  it('stores a pronunciation', async () => {
    await runAnnounce({ sub: 'pronounce', text: 'Ar-mahn-doe' }, caller, h.deps);

    expect((await override())?.pronunciation).toBe('Ar-mahn-doe');
  });

  it('rejects an over-long message without changing anything', async () => {
    const result = await runAnnounce({ sub: 'enter', text: 'x'.repeat(151) }, caller, h.deps);

    expect(await override()).toBeNull();
    expect(result.reply).toMatch(/too long/i);
  });

  it('rejects an empty message', async () => {
    const result = await runAnnounce({ sub: 'exit', text: '   ' }, caller, h.deps);

    expect(await override()).toBeNull();
    expect(result.reply).toMatch(/empty/i);
  });

  it('rejects an unspeakable pronunciation', async () => {
    const result = await runAnnounce({ sub: 'pronounce', text: '🔥' }, caller, h.deps);

    expect(await override()).toBeNull();
    expect(result.reply).toMatch(/letter or number/i);
  });

  it('only ever changes the caller, never another member', async () => {
    await runAnnounce({ sub: 'pronounce', text: 'Me' }, caller, h.deps);

    expect(await h.deps.store.getOverride('g1', 'u2')).toBeNull();
  });
});

describe('/announce sneak', () => {
  it('turns sneaking on and off', async () => {
    const on = await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);
    expect((await override())?.sneak).toBe(true);
    expect(on.reply).toMatch(/won.t be announced/i);

    const off = await runAnnounce({ sub: 'sneak', enabled: false }, caller, h.deps);
    expect(await override()).toBeNull();
    expect(off.reply).toMatch(/announced again/i);
  });

  it('refuses to start sneaking when the server does not allow it', async () => {
    await h.deps.store.updateGuild('g1', { sneakingAllowed: false });

    const result = await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);

    expect(await override()).toBeNull();
    expect(result.reply).toMatch(/not allowed/i);
  });

  it('always lets a member stop sneaking', async () => {
    await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);
    await h.deps.store.updateGuild('g1', { sneakingAllowed: false });

    await runAnnounce({ sub: 'sneak', enabled: false }, caller, h.deps);

    expect(await override()).toBeNull();
  });

  it('cannot lift an admin silence by clearing settings', async () => {
    await h.deps.store.setFlag('g1', 'u1', 'silenced', true, 'admin');

    await runAnnounce({ sub: 'clear', field: 'all' }, caller, h.deps);

    expect((await override())?.silenced).toBe(true);
  });
});

describe('/announce clear', () => {
  beforeEach(async () => {
    await runAnnounce({ sub: 'voice', voice: 'Joanna' }, caller, h.deps);
    await runAnnounce({ sub: 'pronounce', text: 'Mondo' }, caller, h.deps);
  });

  it('removes one setting and keeps the rest', async () => {
    await runAnnounce({ sub: 'clear', field: 'voice' }, caller, h.deps);

    expect(await override()).toMatchObject({ voiceId: null, pronunciation: 'Mondo' });
  });

  it('removes everything', async () => {
    await runAnnounce({ sub: 'clear', field: 'all' }, caller, h.deps);

    expect(await override()).toBeNull();
  });

  it('says so when there was nothing to remove', async () => {
    await runAnnounce({ sub: 'clear', field: 'all' }, caller, h.deps);
    const result = await runAnnounce({ sub: 'clear', field: 'all' }, caller, h.deps);

    expect(result.reply).toMatch(/no personal settings/i);
  });
});

describe('/announce show', () => {
  it('describes the defaults when the member has no settings', async () => {
    const result = await runAnnounce({ sub: 'show' }, caller, h.deps);

    expect(result.reply).toContain('Mando has entered the channel');
    expect(result.reply).toContain('Mando has left the channel');
    expect(result.reply).toContain('Matthew');
  });

  it('reflects personal settings in what will be spoken', async () => {
    await runAnnounce({ sub: 'voice', voice: 'Joanna' }, caller, h.deps);
    await runAnnounce({ sub: 'pronounce', text: 'Mondo' }, caller, h.deps);
    await runAnnounce({ sub: 'enter', text: 'Here comes %name' }, caller, h.deps);

    const result = await runAnnounce({ sub: 'show' }, caller, h.deps);

    expect(result.reply).toContain('Here comes Mondo');
    expect(result.reply).toContain('Mondo has left the channel');
    expect(result.reply).toContain('Joanna');
  });

  it('shows the server value for each unset setting, marked as the server default', async () => {
    await h.deps.store.updateGuild('g1', { exitTemplate: 'So long %name' });

    const lines = (await runAnnounce({ sub: 'show' }, caller, h.deps)).reply.split('\n');

    expect(lines).toContain('Voice: Matthew *(server default)*');
    expect(lines).toContain('Enter message: %name has entered the channel *(server default)*');
    expect(lines).toContain('Exit message: So long %name *(server default)*');
    expect(lines).toContain('Pronunciation: Mando *(your display name)*');
  });

  it('shows personal values without the server-default mark', async () => {
    await runAnnounce({ sub: 'voice', voice: 'Joanna' }, caller, h.deps);
    await runAnnounce({ sub: 'enter', text: 'Here comes %name' }, caller, h.deps);
    await runAnnounce({ sub: 'pronounce', text: 'Mondo' }, caller, h.deps);

    const lines = (await runAnnounce({ sub: 'show' }, caller, h.deps)).reply.split('\n');

    expect(lines).toContain('Voice: Joanna');
    expect(lines).toContain('Enter message: Here comes %name');
    expect(lines).toContain('Exit message: %name has left the channel *(server default)*');
    expect(lines).toContain('Pronunciation: Mondo');
  });

  it('shows whether the member is sneaking', async () => {
    const before = (await runAnnounce({ sub: 'show' }, caller, h.deps)).reply.split('\n');
    expect(before).toContain('Sneaking: off');

    await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);
    const after = (await runAnnounce({ sub: 'show' }, caller, h.deps)).reply.split('\n');
    expect(after).toContain('Sneaking: on');
  });

  it('notes when a sneak is ignored because the server disallows sneaking', async () => {
    await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);
    await h.deps.store.updateGuild('g1', { sneakingAllowed: false });

    const { reply } = await runAnnounce({ sub: 'show' }, caller, h.deps);

    expect(reply).toMatch(/Sneaking: on .*not allowed on this server/);
  });

  it('tells a silenced member they will not be announced', async () => {
    await h.deps.store.setFlag('g1', 'u1', 'silenced', true, 'admin');

    const { reply } = await runAnnounce({ sub: 'show' }, caller, h.deps);

    expect(reply).toMatch(/silenced by an admin/i);
  });

  it('uses the server template when the member has none', async () => {
    await h.deps.store.updateGuild('g1', { enterTemplate: 'Welcome %name' });

    const result = await runAnnounce({ sub: 'show' }, caller, h.deps);

    expect(result.reply).toContain('Welcome Mando');
  });
});

describe('/announce preview', () => {
  it('speaks the enter announcement in the caller’s voice channel', async () => {
    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toEqual({
      guildId: 'g1',
      channelId: 'c9',
      text: 'Mando has entered the channel',
      voiceId: 'Matthew',
      kind: 'enter',
    });
  });

  it('only shows the text when the caller is not in a voice channel', async () => {
    const result = await runAnnounce({ sub: 'preview' }, caller, h.deps);

    expect(result.speak).toBeUndefined();
    expect(result.reply).toContain('Mando has entered the channel');
    expect(result.reply).toMatch(/join a voice channel/i);
  });

  it('does not speak in a denied channel, but still shows the text', async () => {
    await h.deps.store.setRule('g1', 'c9', 'deny');

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toBeUndefined();
    expect(result.reply).toContain('Mando has entered the channel');
    expect(result.reply).toMatch(/announcements are off in this channel/i);
  });

  it('does not speak in a channel left out of the allow list', async () => {
    await h.deps.store.setRule('g1', 'other', 'allow');

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toBeUndefined();
  });

  it('speaks in an allowed channel', async () => {
    await h.deps.store.setRule('g1', 'c9', 'allow');

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak?.channelId).toBe('c9');
  });

  it('does not speak for a silenced member, and says why', async () => {
    await h.deps.store.setFlag('g1', 'u1', 'silenced', true, 'admin');

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toBeUndefined();
    expect(result.reply).toContain('Mando has entered the channel');
    expect(result.reply).toMatch(/silenced by an admin/i);
  });

  it('does not speak for a sneaking member, and says how to stop', async () => {
    await runAnnounce({ sub: 'sneak', enabled: true }, caller, h.deps);

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toBeUndefined();
    expect(result.reply).toMatch(/sneaking/i);
    expect(result.reply).toContain('/announce sneak');
  });

  it('does not speak where speech is not enabled, and says why', async () => {
    h.enabled.clear();

    const result = await runAnnounce({ sub: 'preview' }, { ...caller, voiceChannelId: 'c9' }, h.deps);

    expect(result.speak).toBeUndefined();
    expect(result.reply).toMatch(/not enabled/i);
  });
});

describe('/announce voices', () => {
  it('lists every voice grouped by language', async () => {
    const result = await runAnnounce({ sub: 'voices' }, caller, h.deps);

    expect(result.reply).toContain('US English (en-US)');
    expect(result.reply).toContain('Joanna, Matthew');
    expect(result.reply).toContain('Lucia');
  });

  it('filters by language code', async () => {
    const result = await runAnnounce({ sub: 'voices', language: 'ES-es' }, caller, h.deps);

    expect(result.reply).toContain('Lucia');
    expect(result.reply).not.toContain('Joanna');
  });

  it('filters by part of a language name', async () => {
    const result = await runAnnounce({ sub: 'voices', language: 'spanish' }, caller, h.deps);

    expect(result.reply).toContain('Lucia');
    expect(result.reply).not.toContain('Matthew');
  });

  it('says so when no language matches', async () => {
    const result = await runAnnounce({ sub: 'voices', language: 'klingon' }, caller, h.deps);

    expect(result.reply).toMatch(/no voices/i);
  });

  it('stays within Discord’s 2000 character message limit', async () => {
    h.voices = Array.from({ length: 600 }, (_, i) => ({
      id: `Voice${i}`,
      name: `Voice${i}`,
      languageCode: `l${i % 40}`,
      languageName: `Language ${i % 40}`,
    }));

    const result = await runAnnounce({ sub: 'voices' }, caller, h.deps);

    expect(result.reply.length).toBeLessThanOrEqual(2000);
    expect(result.reply).toMatch(/language/i);
  });
});
