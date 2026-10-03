import { Collection, Status } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { gatewayReady, Watchdog } from '../src/watchdog.js';

function setup(maxUnhealthyMs = 1000) {
  let time = 0;
  let healthy = true;
  const onStuck = vi.fn();
  const watchdog = new Watchdog({
    isHealthy: () => healthy,
    maxUnhealthyMs,
    onStuck,
    now: () => time,
  });
  return {
    watchdog,
    onStuck,
    at(ms: number, isHealthy: boolean) {
      time = ms;
      healthy = isHealthy;
      watchdog.check();
    },
  };
}

describe('Watchdog', () => {
  it('stays quiet while healthy', () => {
    const { at, onStuck } = setup();
    at(0, true);
    at(5000, true);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('tolerates an outage shorter than the limit', () => {
    const { at, onStuck } = setup();
    at(0, false);
    at(999, false);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it('reports once the outage reaches the limit, with how long it lasted', () => {
    const { at, onStuck } = setup();
    at(0, false);
    at(1000, false);
    expect(onStuck).toHaveBeenCalledOnce();
    expect(onStuck).toHaveBeenCalledWith(1000);
  });

  it('restarts the clock after a recovery', () => {
    const { at, onStuck } = setup();
    at(0, false);
    at(900, true);
    at(1000, false);
    at(1900, false);
    expect(onStuck).not.toHaveBeenCalled();
    at(2000, false);
    expect(onStuck).toHaveBeenCalledOnce();
  });

  it('reports only once', () => {
    const { at, onStuck } = setup();
    at(0, false);
    at(1000, false);
    at(2000, false);
    expect(onStuck).toHaveBeenCalledOnce();
  });

  it('checks on an interval once started, and stops when asked', () => {
    vi.useFakeTimers();
    try {
      const isHealthy = vi.fn(() => true);
      const watchdog = new Watchdog({ isHealthy, maxUnhealthyMs: 1000, onStuck: () => {} });
      watchdog.start(100);
      vi.advanceTimersByTime(350);
      expect(isHealthy).toHaveBeenCalledTimes(3);
      watchdog.stop();
      vi.advanceTimersByTime(1000);
      expect(isHealthy).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('gatewayReady', () => {
  const shards = (...statuses: Status[]) =>
    new Collection(statuses.map((status, id) => [id, { status }] as const));

  it('is ready only when every shard is ready', () => {
    expect(gatewayReady({ shards: shards(Status.Ready) })).toBe(true);
    expect(gatewayReady({ shards: shards(Status.Ready, Status.Ready) })).toBe(true);
    expect(gatewayReady({ shards: shards(Status.Ready, Status.Connecting) })).toBe(false);
  });

  it('is not ready while reconnecting or after giving up', () => {
    for (const status of [Status.Connecting, Status.Resuming, Status.Identifying, Status.Disconnected]) {
      expect(gatewayReady({ shards: shards(status) })).toBe(false);
    }
  });

  it('is not ready with no shards', () => {
    expect(gatewayReady({ shards: shards() })).toBe(false);
  });
});
