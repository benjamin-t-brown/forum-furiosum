import 'dotenv/config';
import { getDb } from './db/db';
import { runMigrations } from './db/migrations';
import { cleanupInactiveEphemeralUsers } from './services/ephemeralUsers';

export async function runCleanupEphemeral(inactiveDays = 7): Promise<number> {
  const db = getDb();
  runMigrations(db);

  const cleaned = await cleanupInactiveEphemeralUsers(db, inactiveDays);
  console.log(`Cleaned up ${cleaned} inactive ephemeral account(s).`);
  return cleaned;
}

if (require.main === module) {
  runCleanupEphemeral().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
