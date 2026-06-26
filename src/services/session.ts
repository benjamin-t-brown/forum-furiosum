import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type { Session } from '../models';

const SESSION_MAX_AGE_DAYS = 14;

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSession(
  db: Database.Database,
  userId: string,
  ip?: string,
  userAgent?: string
): Session {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ipHash = ip ? hashValue(ip) : null;
  const userAgentHash = userAgent ? hashValue(userAgent) : null;

  db.prepare(`
    INSERT INTO sessions (sessionId, userId, expiresAt, ipHash, userAgentHash)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt, ipHash, userAgentHash);

  return db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(sessionId) as Session;
}

export function getSession(db: Database.Database, sessionId: string): Session | null {
  const session = db.prepare(
    "SELECT * FROM sessions WHERE sessionId = ? AND datetime(expiresAt) > datetime('now')"
  ).get(sessionId) as Session | undefined;

  if (!session) {return null;}

  // Update lastSeenAt
  db.prepare("UPDATE sessions SET lastSeenAt = datetime('now') WHERE sessionId = ?").run(sessionId);

  return session;
}

export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE sessionId = ?').run(sessionId);
}

export function deleteExpiredSessions(db: Database.Database): void {
  db.prepare("DELETE FROM sessions WHERE datetime(expiresAt) <= datetime('now')").run();
}

export function deleteUserSessions(db: Database.Database, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
}

export const SESSION_COOKIE_NAME = 'ff_session';
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
