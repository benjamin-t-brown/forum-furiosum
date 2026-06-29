import Database from 'better-sqlite3';

export function migration006(db: Database.Database): void {
  db.exec(`
    ALTER TABLE threads ADD COLUMN autoApproveReplies INTEGER NOT NULL DEFAULT 0;
  `);
}
