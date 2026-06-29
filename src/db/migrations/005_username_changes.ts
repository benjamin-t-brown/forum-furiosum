import Database from 'better-sqlite3';

export function migration005(db: Database.Database): void {
  db.exec(`
    CREATE TABLE username_change_requests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      requestedUsername TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'approved', 'rejected')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      reviewedByUserId TEXT REFERENCES users(id),
      reviewedAt TEXT,
      reason TEXT
    );

    CREATE INDEX idx_username_change_requests_status ON username_change_requests(status);
    CREATE INDEX idx_username_change_requests_user ON username_change_requests(userId);
  `);
}
