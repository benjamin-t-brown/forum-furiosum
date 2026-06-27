import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH ?? './forum.sqlite';
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
  }
  return db;
}
