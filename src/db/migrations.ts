import Database from 'better-sqlite3';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_embed_threads';
import { migration003 } from './migrations/003_home_intro';
import { migration004 } from './migrations/004_theme_color_surface';
import { migration005 } from './migrations/005_username_changes';
import { migration006 } from './migrations/006_auto_approve_replies';
import { migration007 } from './migrations/007_reply_approval_trust';
import { migration008 } from './migrations/008_notify_state';
import { migration009 } from './migrations/009_thread_locked';
import { migration010, migration010RequiresOwnTransaction } from './migrations/010_ephemeral_users';

const migrations: { id: string; name: string; run: (db: Database.Database) => void; ownTransaction?: boolean }[] = [
  { id: '001', name: 'initial', run: migration001 },
  { id: '002', name: 'embed_threads', run: migration002 },
  { id: '003', name: 'home_intro', run: migration003 },
  { id: '004', name: 'theme_color_surface', run: migration004 },
  { id: '005', name: 'username_changes', run: migration005 },
  { id: '006', name: 'auto_approve_replies', run: migration006 },
  { id: '007', name: 'reply_approval_trust', run: migration007 },
  { id: '008', name: 'notify_state', run: migration008 },
  { id: '009', name: 'thread_locked', run: migration009 },
  { id: '010', name: 'ephemeral_users', run: migration010, ownTransaction: migration010RequiresOwnTransaction },
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
      const run = () => {
        migration.run(db);
        db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      };
      if (migration.ownTransaction) {
        run();
      } else {
        db.transaction(run)();
      }
      console.log(`Applied migration ${migration.id}: ${migration.name}`);
    }
  }
}
