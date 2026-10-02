const POLL_MS = 50;

/**
 * Polls `condition` until it holds or `timeoutMs` passes. Resolves to whether
 * the condition was met.
 */
export async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return true;
}
