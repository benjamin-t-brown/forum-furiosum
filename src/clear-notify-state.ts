import 'dotenv/config';
import { getDb } from './db/db';
import { runMigrations } from './db/migrations';
import { clearNotifyState } from './services/notifyState';

export function runClearNotifyState(now = new Date()): { lastUntil: string; clearedNotifiedCount: number } {
  const db = getDb();
  runMigrations(db);

  const result = clearNotifyState(db, now);
  console.log(`Notify state cleared. Watermark set to ${result.lastUntil}. Removed ${result.clearedNotifiedCount} notified-event record(s).`);
  console.log('The next notify run will only consider forum activity after this moment.');
  return result;
}

if (require.main === module) {
  try {
    runClearNotifyState();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
