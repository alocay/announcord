import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

/**
 * Copies the database to `dest` with SQLite's online backup, which is safe
 * while the bot is running. Copying the file itself is not: in WAL mode
 * recent writes live in a separate `-wal` file until they are checkpointed.
 */
export async function backupDatabase(source: string, dest: string): Promise<void> {
  const sqlite = new Database(source, { fileMustExist: true });
  try {
    await mkdir(dirname(dest), { recursive: true });
    await sqlite.backup(dest);
  } finally {
    sqlite.close();
  }
}

/** For example `announcord-2026-10-02T20-15-07Z.sqlite`. */
export function backupFileName(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
  return `announcord-${stamp}Z.sqlite`;
}
