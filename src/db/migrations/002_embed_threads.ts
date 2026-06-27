import Database from 'better-sqlite3';

export function migration002(db: Database.Database): void {
  db.exec(`
    ALTER TABLE threads ADD COLUMN embedEnabled INTEGER NOT NULL DEFAULT 0;
  `);
}
