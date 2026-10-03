import { Status, type Collection } from 'discord.js';

/**
 * Whether every gateway shard is connected. `client.ws.status` is not usable
 * for this: discord.js sets it to Ready once at startup and never changes it
 * again, while each shard's status follows its connection.
 */
export function gatewayReady(ws: { shards: Collection<number, { status: Status }> }): boolean {
  return ws.shards.size > 0 && ws.shards.every((shard) => shard.status === Status.Ready);
}

export interface WatchdogDeps {
  isHealthy(): boolean;
  /** How long the check may keep failing before `onStuck` is called. */
  maxUnhealthyMs: number;
  /** Called once, with how long the check has been failing. */
  onStuck(unhealthyForMs: number): void;
  now?: () => number;
}

/**
 * Notices when the bot stays unhealthy (for example disconnected from Discord
 * and not reconnecting) so it can exit and be restarted by Docker. A process
 * that is alive but stuck is otherwise never restarted.
 */
export class Watchdog {
  private readonly now: () => number;
  private unhealthySince: number | null = null;
  private reported = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: WatchdogDeps) {
    this.now = deps.now ?? Date.now;
  }

  check(): void {
    if (this.reported) return;
    if (this.deps.isHealthy()) {
      this.unhealthySince = null;
      return;
    }

    const now = this.now();
    this.unhealthySince ??= now;
    const unhealthyFor = now - this.unhealthySince;
    if (unhealthyFor >= this.deps.maxUnhealthyMs) {
      this.reported = true;
      this.deps.onStuck(unhealthyFor);
    }
  }

  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => this.check(), intervalMs);
    // Never the reason the process stays alive.
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
