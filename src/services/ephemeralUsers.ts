import crypto from 'crypto';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Session, User } from '../models';
import { hashPassword } from './auth';
import { createSession } from './session';
import { allowsEphemeralReplies } from '../utils/replyApprovalTrust';
import { generateEphemeralUsername, isValidEphemeralClientId } from '../utils/ephemeralUsername';
import { getThreadById } from './threads';
import { deleteAccount } from './users';

export function isEphemeralUser(user: Pick<User, 'isEphemeral'> | null | undefined): boolean {
  return user?.isEphemeral === 1;
}

function touchUserActivity(db: Database.Database, userId: string): void {
  db.prepare("UPDATE users SET lastActivityAt = datetime('now') WHERE id = ?").run(userId);
}

export async function createEphemeralUser(db: Database.Database): Promise<User> {
  const id = uuidv4();
  const username = generateEphemeralUsername(db);
  const email = `${id}@ephemeral.invalid`;
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

  db.prepare(`
    INSERT INTO users (id, username, email, passwordHash, role, trust, isEphemeral, lastActivityAt)
    VALUES (?, ?, ?, ?, 'user', 'unknown', 1, datetime('now'))
  `).run(id, username, email, passwordHash);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

export function getEphemeralClientUserId(db: Database.Database, clientId: string): string | null {
  const row = db.prepare('SELECT userId FROM ephemeral_clients WHERE clientId = ?').get(clientId) as { userId: string } | undefined;
  return row?.userId ?? null;
}

export type IdentifyEphemeralResult =
  | { ok: true; user: User; session: Session; isNew: boolean }
  | { ok: false; code: string; message: string };

export async function identifyEphemeralClient(
  db: Database.Database,
  clientId: string,
  threadId: string,
  ip?: string,
  userAgent?: string
): Promise<IdentifyEphemeralResult> {
  if (!isValidEphemeralClientId(clientId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid clientId' };
  }

  const thread = getThreadById(db, threadId);
  if (!thread) {
    return { ok: false, code: 'NOT_FOUND', message: 'Thread not found' };
  }
  if (!allowsEphemeralReplies(thread.replyApprovalTrust)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Ephemeral replies are not enabled for this thread' };
  }

  let userId = getEphemeralClientUserId(db, clientId);
  let isNew = false;

  if (userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0 AND isEphemeral = 1').get(userId) as User | undefined;
    if (!user) {
      db.prepare('DELETE FROM ephemeral_clients WHERE clientId = ?').run(clientId);
      userId = null;
    } else if (user.trust === 'banned') {
      return { ok: false, code: 'BANNED', message: 'Account is banned' };
    }
  }

  let user: User;
  if (!userId) {
    user = await createEphemeralUser(db);
    db.prepare('INSERT INTO ephemeral_clients (clientId, userId) VALUES (?, ?)').run(clientId, user.id);
    isNew = true;
  } else {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
    touchUserActivity(db, user.id);
  }

  const session = createSession(db, user.id, ip, userAgent);
  return { ok: true, user, session, isNew };
}

export async function upgradeEphemeralUser(
  db: Database.Database,
  ephemeralUserId: string,
  username: string,
  email: string,
  password: string,
  trust?: User['trust']
): Promise<User | null> {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0 AND isEphemeral = 1').get(ephemeralUserId) as User | undefined;
  if (!user) {return null;}

  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.toLowerCase().trim();
  const resolvedTrust = trust ?? 'new';

  db.prepare(`
    UPDATE users SET
      username = ?,
      email = ?,
      passwordHash = ?,
      trust = ?,
      isEphemeral = 0,
      lastActivityAt = datetime('now'),
      updatedAt = datetime('now')
    WHERE id = ?
  `).run(username, normalizedEmail, passwordHash, resolvedTrust, ephemeralUserId);

  db.prepare('DELETE FROM ephemeral_clients WHERE userId = ?').run(ephemeralUserId);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(ephemeralUserId) as User;
}

export async function cleanupInactiveEphemeralUsers(db: Database.Database, inactiveDays = 7): Promise<number> {
  const rows = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.isEphemeral = 1 AND u.isDeleted = 0
      AND datetime(COALESCE(
        u.lastActivityAt,
        (SELECT MAX(p.createdAt) FROM posts p WHERE p.authorUserId = u.id),
        u.createdAt
      )) <= datetime('now', ?)
  `).all(`-${inactiveDays} days`) as { id: string }[];

  let cleaned = 0;
  for (const { id } of rows) {
    const result = await deleteAccount(db, id, id, 'Inactive ephemeral account cleanup');
    if (result.success) {cleaned++;}
  }
  return cleaned;
}

export function canEphemeralUserPostToThread(
  replyApprovalTrust: string | null | undefined,
  user: Pick<User, 'isEphemeral'> | null | undefined
): boolean {
  if (!isEphemeralUser(user)) {return true;}
  return allowsEphemeralReplies(replyApprovalTrust as Parameters<typeof allowsEphemeralReplies>[0]);
}

export function touchEphemeralActivity(db: Database.Database, userId: string): void {
  db.prepare("UPDATE users SET lastActivityAt = datetime('now') WHERE id = ? AND isEphemeral = 1").run(userId);
}
