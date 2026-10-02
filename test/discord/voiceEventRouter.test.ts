import { describe, expect, it } from 'vitest';
import { routeVoiceChange, type RawVoiceChange } from '../../src/discord/voiceEventRouter.js';

const AFK = 'afk';

function change(overrides: Partial<RawVoiceChange>): RawVoiceChange {
  return {
    guildId: 'g1',
    userId: 'u1',
    isBot: false,
    names: ['Nick', 'user'],
    oldChannelId: null,
    newChannelId: null,
    afkChannelId: AFK,
    ...overrides,
  };
}

describe('routeVoiceChange', () => {
  it('reports a join when a member connects to a channel', () => {
    expect(routeVoiceChange(change({ newChannelId: 'a' }))).toEqual({
      type: 'join',
      guildId: 'g1',
      userId: 'u1',
      names: ['Nick', 'user'],
      fromChannelId: null,
      toChannelId: 'a',
    });
  });

  it('reports an exit when a member disconnects', () => {
    expect(routeVoiceChange(change({ oldChannelId: 'a' }))).toMatchObject({
      type: 'exit',
      fromChannelId: 'a',
      toChannelId: null,
    });
  });

  it('reports a move between two channels', () => {
    expect(routeVoiceChange(change({ oldChannelId: 'a', newChannelId: 'b' }))).toMatchObject({
      type: 'move',
      fromChannelId: 'a',
      toChannelId: 'b',
    });
  });

  it('ignores updates that stay in the same channel, such as mute or deafen', () => {
    expect(routeVoiceChange(change({ oldChannelId: 'a', newChannelId: 'a' }))).toBeNull();
  });

  it('ignores bots', () => {
    expect(routeVoiceChange(change({ isBot: true, newChannelId: 'a' }))).toBeNull();
  });

  it('treats moving into the AFK channel as an exit', () => {
    expect(routeVoiceChange(change({ oldChannelId: 'a', newChannelId: AFK }))).toMatchObject({
      type: 'exit',
      fromChannelId: 'a',
      toChannelId: null,
    });
  });

  it('treats moving out of the AFK channel as a join', () => {
    expect(routeVoiceChange(change({ oldChannelId: AFK, newChannelId: 'b' }))).toMatchObject({
      type: 'join',
      fromChannelId: null,
      toChannelId: 'b',
    });
  });

  it('ignores connecting straight into the AFK channel', () => {
    expect(routeVoiceChange(change({ newChannelId: AFK }))).toBeNull();
  });

  it('ignores disconnecting from the AFK channel', () => {
    expect(routeVoiceChange(change({ oldChannelId: AFK }))).toBeNull();
  });

  it('handles guilds without an AFK channel', () => {
    expect(
      routeVoiceChange(change({ afkChannelId: null, oldChannelId: 'a', newChannelId: 'b' })),
    ).toMatchObject({ type: 'move' });
  });
});
