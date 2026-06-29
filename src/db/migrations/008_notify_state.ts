import Database from 'better-sqlite3';

export function migration008(db: Database.Database): void {
  db.exec(`
    CREATE TABLE notify_poll_state (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      lastUntil TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE notified_events (
      eventId TEXT PRIMARY KEY,
      notifiedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_notified_events_notified_at ON notified_events(notifiedAt);
  `);
}
