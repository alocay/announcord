import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({ level });
}

/** Logger that discards everything; used by tests. */
export const silentLogger: Logger = pino({ level: 'silent' });
