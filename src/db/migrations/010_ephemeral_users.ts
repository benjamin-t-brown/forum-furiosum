import Database from 'better-sqlite3';

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function threadsCheckAllowsEphemeral(db: Database.Database): boolean {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'threads'").get() as
    | { sql: string }
    | undefined;
  return row?.sql.includes("'ephemeral'") ?? false;
}

function rebuildThreadsForEphemeralTrust(db: Database.Database): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      CREATE TABLE threads_new (
        id TEXT PRIMARY KEY,
        categoryId TEXT NOT NULL REFERENCES categories(id),
        authorUserId TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        approvalStatus TEXT NOT NULL DEFAULT 'new' CHECK(approvalStatus IN ('new', 'approved', 'unapproved', 'unknown')),
        isHidden INTEGER NOT NULL DEFAULT 0,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        isLocked INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        lastEditedAt TEXT,
        lastEditedByUserId TEXT REFERENCES users(id),
        lastEditedReason TEXT,
        embedEnabled INTEGER NOT NULL DEFAULT 0,
        replyApprovalTrust TEXT CHECK(
          replyApprovalTrust IS NULL OR replyApprovalTrust IN ('new', 'unknown', 'trusted', 'verified', 'ephemeral')
        )
      );

      INSERT INTO threads_new (
        id, categoryId, authorUserId, title, body, approvalStatus, isHidden, isDeleted, isLocked,
        createdAt, updatedAt, lastEditedAt, lastEditedByUserId, lastEditedReason, embedEnabled, replyApprovalTrust
      )
      SELECT
        id, categoryId, authorUserId, title, body, approvalStatus, isHidden, isDeleted, isLocked,
        createdAt, updatedAt, lastEditedAt, lastEditedByUserId, lastEditedReason, embedEnabled, replyApprovalTrust
      FROM threads;

      DROP TABLE threads;
      ALTER TABLE threads_new RENAME TO threads;

      CREATE INDEX idx_threads_category_updated ON threads(categoryId, updatedAt DESC);
      CREATE INDEX idx_threads_updated ON threads(updatedAt DESC);
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function migration010(db: Database.Database): void {
  if (!columnExists(db, 'users', 'isEphemeral')) {
    db.exec(`ALTER TABLE users ADD COLUMN isEphemeral INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists(db, 'users', 'lastActivityAt')) {
    db.exec(`ALTER TABLE users ADD COLUMN lastActivityAt TEXT`);
  }

  if (!tableExists(db, 'ephemeral_clients')) {
    db.exec(`
      CREATE TABLE ephemeral_clients (
        clientId TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_ephemeral_clients_user ON ephemeral_clients(userId);
    `);
  }

  if (!tableExists(db, 'ephemeral_name_usage')) {
    db.exec(`
      CREATE TABLE ephemeral_name_usage (
        date TEXT NOT NULL,
        word TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('adjective', 'noun')),
        PRIMARY KEY (date, word, kind)
      );
    `);
  }

  if (!threadsCheckAllowsEphemeral(db)) {
    rebuildThreadsForEphemeralTrust(db);
  }
}

/** Must run outside a transaction (SQLite ignores foreign_keys pragma changes in transactions). */
export const migration010RequiresOwnTransaction = true;
