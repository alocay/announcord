import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const valid = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123',
  AWS_ACCESS_KEY_ID: 'key',
  AWS_SECRET_ACCESS_KEY: 'secret',
};

describe('loadConfig', () => {
  it('applies defaults when only required variables are set', () => {
    const config = loadConfig(valid);

    expect(config).toMatchObject({
      discordToken: 'token',
      discordClientId: '123',
      awsRegion: 'us-east-1',
      devGuildId: undefined,
      dataDir: './data',
      idleLeaveSeconds: 60,
      cacheMaxMb: 200,
      logLevel: 'info',
    });
    expect(config.unlimitedGuildIds.size).toBe(0);
  });

  it('parses a comma-separated guild list, ignoring blanks and spaces', () => {
    const config = loadConfig({ ...valid, UNLIMITED_GUILD_IDS: ' 1, 2 ,' });

    expect([...config.unlimitedGuildIds]).toEqual(['1', '2']);
  });

  it('treats an empty optional variable as unset', () => {
    const config = loadConfig({ ...valid, DEV_GUILD_ID: '', IDLE_LEAVE_SECONDS: '' });

    expect(config.devGuildId).toBeUndefined();
    expect(config.idleLeaveSeconds).toBe(60);
  });

  it('names every missing required variable', () => {
    expect(() => loadConfig({ AWS_ACCESS_KEY_ID: 'key' })).toThrowError(ConfigError);
    try {
      loadConfig({ AWS_ACCESS_KEY_ID: 'key' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DISCORD_TOKEN');
      expect(message).toContain('DISCORD_CLIENT_ID');
      expect(message).toContain('AWS_SECRET_ACCESS_KEY');
      expect(message).not.toContain('AWS_ACCESS_KEY_ID');
    }
  });

  it('rejects a non-numeric idle timeout', () => {
    expect(() => loadConfig({ ...valid, IDLE_LEAVE_SECONDS: 'soon' })).toThrowError(
      /IDLE_LEAVE_SECONDS/,
    );
  });

  it('never includes a secret value in the error message', () => {
    try {
      loadConfig({ ...valid, DISCORD_TOKEN: 'super-secret', CACHE_MAX_MB: '-5' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret');
    }
  });
});
