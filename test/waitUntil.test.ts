import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from '../src/waitUntil.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitUntil', () => {
  it('resolves true at once when the condition already holds', async () => {
    await expect(waitUntil(() => true, 1000)).resolves.toBe(true);
  });

  it('resolves true as soon as the condition becomes true', async () => {
    let done = false;
    const result = waitUntil(() => done, 1000);

    await vi.advanceTimersByTimeAsync(200);
    done = true;
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe(true);
  });

  it('resolves false when the condition never holds within the time limit', async () => {
    const result = waitUntil(() => false, 1000);

    await vi.advanceTimersByTimeAsync(1050);

    await expect(result).resolves.toBe(false);
  });
});
