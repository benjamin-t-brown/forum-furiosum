import Database from 'better-sqlite3';

export function migration001(db: Database.Database): void {
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'moderator', 'user')),
      trust TEXT NOT NULL DEFAULT 'new' CHECK(trust IN ('new', 'unknown', 'trusted', 'verified', 'banned')),
      isDeleted INTEGER NOT NULL DEFAULT 0,
      theme TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastLoginAt TEXT
    );

    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      isHidden INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      categoryId TEXT NOT NULL REFERENCES categories(id),
      authorUserId TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      approvalStatus TEXT NOT NULL DEFAULT 'new' CHECK(approvalStatus IN ('new', 'approved', 'unapproved', 'unknown')),
      isHidden INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastEditedAt TEXT,
      lastEditedByUserId TEXT REFERENCES users(id),
      lastEditedReason TEXT
    );
    CREATE INDEX idx_threads_category_updated ON threads(categoryId, updatedAt DESC);
    CREATE INDEX idx_threads_updated ON threads(updatedAt DESC);

    CREATE TABLE posts (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL REFERENCES threads(id),
      authorUserId TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      approvalStatus TEXT NOT NULL DEFAULT 'new' CHECK(approvalStatus IN ('new', 'approved', 'unapproved', 'unknown')),
      isHidden INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastEditedAt TEXT,
      lastEditedByUserId TEXT REFERENCES users(id),
      lastEditedReason TEXT
    );
    CREATE INDEX idx_posts_thread_created ON posts(threadId, createdAt ASC);

    CREATE TABLE sessions (
      sessionId TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL DEFAULT (datetime('now')),
      ipHash TEXT,
      userAgentHash TEXT
    );
    CREATE INDEX idx_sessions_user ON sessions(userId);
    CREATE INDEX idx_sessions_expires ON sessions(expiresAt);

    CREATE TABLE moderation_audit_log (
      id TEXT PRIMARY KEY,
      actorUserId TEXT NOT NULL REFERENCES users(id),
      targetType TEXT NOT NULL CHECK(targetType IN ('user', 'thread', 'post')),
      targetId TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_audit_log_actor ON moderation_audit_log(actorUserId);
    CREATE INDEX idx_audit_log_target ON moderation_audit_log(targetType, targetId);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('forumName', 'Forum Furiosum'),
      ('topBarLinks', '[]'),
      ('featuredCategories', '[]'),
      ('themeColorPrimary', '#8eb1c7'),
      ('themeColorAccent', '#b02e0c');

    INSERT OR IGNORE INTO categories (id, slug, name, description, sortOrder)
      VALUES ('00000000-0000-0000-0000-000000000001', 'general', 'General Discussion', 'A place for general discussion', 0);
  `);
}
