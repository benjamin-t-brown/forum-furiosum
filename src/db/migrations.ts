import Database from 'better-sqlite3';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_embed_threads';

const migrations = [
  { id: '001', name: 'initial', run: migration001 },
  { id: '002', name: 'embed_threads', run: migration002 },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  for (const migration of migrations) {
    const applied = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(migration.id);
    if (!applied) {
      db.transaction(() => {
        migration.run(db);
        db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      })();
      console.log(`Applied migration ${migration.id}: ${migration.name}`);
    }
  }
}
