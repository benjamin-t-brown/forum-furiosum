import Database from 'better-sqlite3';

export function migration009(db: Database.Database): void {
  db.exec(`
    ALTER TABLE threads ADD COLUMN isLocked INTEGER NOT NULL DEFAULT 0;
  `);
}
