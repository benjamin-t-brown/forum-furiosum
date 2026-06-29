import Database from 'better-sqlite3';

export function migration003(db: Database.Database): void {
  db.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('homeIntro', '');
  `);
}
