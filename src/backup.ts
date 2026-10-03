import { join } from 'node:path';
import { backupDatabase, backupFileName } from './settings/backup.js';

// Writes a consistent copy of the settings database. Safe while the bot runs.
// Usage: node dist/backup.js [destination file]
// Without a destination the copy goes to DATA_DIR/backups/ with a timestamp.
const dataDir = process.env.DATA_DIR || './data';
const dest = process.argv[2] || join(dataDir, 'backups', backupFileName(new Date()));

try {
  await backupDatabase(join(dataDir, 'announcord.sqlite'), dest);
  console.log(`Backed up to ${dest}`);
} catch (error) {
  console.error('Backup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
