import Database from 'better-sqlite3';

export function migration011(db: Database.Database): void {
  db.prepare(`
    UPDATE settings
    SET value = '#b3cfdf', updatedAt = datetime('now')
    WHERE key = 'themeColorPrimary' AND value = '#a8cbe1'
  `).run();
}
