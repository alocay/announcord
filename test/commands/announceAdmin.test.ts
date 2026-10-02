import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAnnounceAdmin, type AdminRequest } from '../../src/commands/announceAdmin.js';
import { caller, createHarness, type Harness } from './helpers.js';

let h: Harness;
const admin = { ...caller, userId: 'admin1', names: ['Boss'] };

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  await h.db.destroy();
});

const run = (req: AdminRequest) => runAnnounceAdmin(req, admin, h.deps);
const guild = () => h.deps.store.getGuild('g1');
const settingsRequest = (warnings: string[] = []): AdminRequest => ({
  sub: 'settings',
  channelName: (id) => `#${id}`,
  warnings,
});

describe('/announce-admin guild settings', () => {
  it('sets the style', async () => {
    await run({ sub: 'style', style: 'join' });

    expect((await guild()).style).toBe('join');
  });

  it('toggles ignore-empty', async () => {
    await run({ sub: 'ignore-empty', enabled: false });

    expect((await guild()).ignoreEmpty).toBe(false);
  });

  it('sets the default voice under its canonical id', async () => {
    const result = await run({ sub: 'voice', voice: 'lucia' });

    expect((await guild()).voiceId).toBe('Lucia');
    expect(result.reply).toContain('Lucia');
  });

  it('rejects an unknown voice without changing anything', async () => {
    const result = await run({ sub: 'voice', voice: 'Nobody' });

    expect((await guild()).voiceId).toBe('Matthew');
    expect(result.reply).toMatch(/no voice/i);
  });

  it('sets the enter and exit templates independently', async () => {
    await run({ sub: 'template', kind: 'enter', text: 'Welcome %name' });
    await run({ sub: 'template', kind: 'exit', text: 'Bye %name' });

    expect(await guild()).toMatchObject({
      enterTemplate: 'Welcome %name',
      exitTemplate: 'Bye %name',
    });
  });

  it('rejects an over-long template without changing anything', async () => {
    const result = await run({ sub: 'template', kind: 'enter', text: 'x'.repeat(151) });

    expect((await guild()).enterTemplate).toBeNull();
    expect(result.reply).toMatch(/too long/i);
  });
});

describe('/announce-admin channel', () => {
  const channel = { channelId: 'c1', channelName: 'General' };

  it('adds an allow rule and explains that other channels are now silent', async () => {
    const result = await run({ sub: 'channel', action: 'allow', ...channel });

    expect([...(await h.deps.store.getRules('g1'))]).toEqual([['c1', 'allow']]);
    expect(result.reply).toMatch(/only/i);
  });

  it('adds a deny rule', async () => {
    await run({ sub: 'channel', action: 'deny', ...channel });

    expect([...(await h.deps.store.getRules('g1'))]).toEqual([['c1', 'deny']]);
  });

  it('removes a rule', async () => {
    await run({ sub: 'channel', action: 'deny', ...channel });
    await run({ sub: 'channel', action: 'unlist', ...channel });

    expect((await h.deps.store.getRules('g1')).size).toBe(0);
  });

  it('says so when there was no rule to remove', async () => {
    const result = await run({ sub: 'channel', action: 'unlist', ...channel });

    expect(result.reply).toMatch(/no rule/i);
  });
});

describe('/announce-admin user', () => {
  const target = { targetId: 'u2', targetName: 'Friend' };

  it('sets another member’s setting and records the admin as the author', async () => {
    await run({ sub: 'user-set', ...target, field: 'pronounce', value: 'Fren' });

    expect((await h.deps.store.getOverride('g1', 'u2'))?.pronunciation).toBe('Fren');
    const row = await h.db.selectFrom('member_overrides').select('updated_by').executeTakeFirst();
    expect(row?.updated_by).toBe('admin1');
  });

  it('validates the value like the member command does', async () => {
    const result = await run({ sub: 'user-set', ...target, field: 'voice', value: 'Nobody' });

    expect(await h.deps.store.getOverride('g1', 'u2')).toBeNull();
    expect(result.reply).toMatch(/no voice/i);
  });

  it('clears one setting of a member', async () => {
    await run({ sub: 'user-set', ...target, field: 'enter', value: 'something rude' });
    await run({ sub: 'user-set', ...target, field: 'voice', value: 'Joanna' });

    await run({ sub: 'user-clear', ...target, field: 'enter' });

    expect(await h.deps.store.getOverride('g1', 'u2')).toMatchObject({
      enterTemplate: null,
      voiceId: 'Joanna',
    });
  });

  it('clears everything for a member', async () => {
    await run({ sub: 'user-set', ...target, field: 'voice', value: 'Joanna' });

    const result = await run({ sub: 'user-clear', ...target, field: 'all' });

    expect(await h.deps.store.getOverride('g1', 'u2')).toBeNull();
    expect(result.reply).toContain('Friend');
  });

  it('does not touch the admin’s own settings', async () => {
    await run({ sub: 'user-set', ...target, field: 'voice', value: 'Joanna' });

    expect(await h.deps.store.getOverride('g1', 'admin1')).toBeNull();
  });
});

describe('/announce-admin settings', () => {
  it('shows the configuration, rules, tier and usage', async () => {
    await run({ sub: 'style', style: 'exit' });
    await run({ sub: 'template', kind: 'enter', text: 'Welcome %name' });
    await run({ sub: 'channel', action: 'deny', channelId: 'c7', channelName: 'x' });
    await h.deps.meter.add('g1', 'polly', 1234);

    const { reply } = await run(settingsRequest());

    expect(reply).toContain('exits only');
    expect(reply).toContain('Welcome %name');
    expect(reply).toContain('%name has left the channel');
    expect(reply).toContain('#c7');
    expect(reply).toContain('1,234');
    expect(reply).toMatch(/speech: enabled/i);
  });

  it('says when speech is not enabled for the server', async () => {
    h.enabled.clear();

    const { reply } = await run(settingsRequest());

    expect(reply).toMatch(/not enabled/i);
  });

  it('lists permission warnings', async () => {
    const { reply } = await run(settingsRequest(['#lobby: missing Speak permission']));

    expect(reply).toContain('#lobby: missing Speak permission');
  });
});

describe('/announce-admin reset', () => {
  it('restores defaults and removes member settings and channel rules', async () => {
    await run({ sub: 'style', style: 'exit' });
    await run({ sub: 'channel', action: 'deny', channelId: 'c7', channelName: 'x' });
    await run({ sub: 'user-set', targetId: 'u2', targetName: 'F', field: 'voice', value: 'Joanna' });

    await run({ sub: 'reset' });

    expect((await guild()).style).toBe('both');
    expect((await h.deps.store.getRules('g1')).size).toBe(0);
    expect(await h.deps.store.getOverride('g1', 'u2')).toBeNull();
  });
});
