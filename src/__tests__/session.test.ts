import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createSession, getSession, deleteSession, deleteExpiredSessions, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '../services/session';

describe('Session service', () => {
  let db: ReturnType<typeof createTestDb>;
  let userId: string;

  beforeEach(async () => {
    db = createTestDb();
    const user = await createUser(db, 'sessuser', 'sess@example.com', 'password123');
    userId = user.id;
  });

  it('creates a session with correct userId and expiry', () => {
    const session = createSession(db, userId, '127.0.0.1', 'test-agent');
    expect(session.sessionId).toBeTruthy();
    expect(session.userId).toBe(userId);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('retrieves a valid session', () => {
    const created = createSession(db, userId);
    const retrieved = getSession(db, created.sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe(userId);
  });

  it('returns null for non-existent session', () => {
    expect(getSession(db, 'non-existent-id')).toBeNull();
  });

  it('deletes a session', () => {
    const session = createSession(db, userId);
    deleteSession(db, session.sessionId);
    expect(getSession(db, session.sessionId)).toBeNull();
  });

  it('exports correct cookie name and max age', () => {
    expect(SESSION_COOKIE_NAME).toBe('ff_session');
    expect(SESSION_MAX_AGE_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('deleteExpiredSessions removes expired sessions', () => {
    // Manually insert an expired session
    const pastDate = new Date(Date.now() - 1000).toISOString();
    db.prepare('INSERT INTO sessions (sessionId, userId, expiresAt) VALUES (?, ?, ?)').run('expired-sess', userId, pastDate);

    deleteExpiredSessions(db);
    expect(getSession(db, 'expired-sess')).toBeNull();
  });
});
