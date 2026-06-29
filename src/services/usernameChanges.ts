import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getUserByUsername } from './auth';
import { updateUser } from './users';
import { writeAuditLog } from './moderation';
import { isValidUsername } from '../utils/authorDisplay';

export interface UsernameChangeRequest {
  id: string;
  userId: string;
  requestedUsername: string;
  status: 'new' | 'approved' | 'rejected';
  createdAt: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reason: string | null;
}

export function getPendingUsernameChangeForUser(
  db: Database.Database,
  userId: string
): UsernameChangeRequest | null {
  return (db.prepare(`
    SELECT * FROM username_change_requests
    WHERE userId = ? AND status = 'new'
    ORDER BY createdAt DESC LIMIT 1
  `).get(userId) as UsernameChangeRequest | undefined) ?? null;
}

export function listPendingUsernameChangeRequests(
  db: Database.Database,
  limit = 20
): (UsernameChangeRequest & { currentUsername: string })[] {
  return db.prepare(`
    SELECT r.*, u.username as currentUsername
    FROM username_change_requests r
    JOIN users u ON r.userId = u.id
    WHERE r.status = 'new'
    ORDER BY r.createdAt ASC
    LIMIT ?
  `).all(limit) as (UsernameChangeRequest & { currentUsername: string })[];
}

export function countPendingUsernameChangeRequests(db: Database.Database): number {
  return (db.prepare(
    "SELECT COUNT(*) as count FROM username_change_requests WHERE status = 'new'"
  ).get() as { count: number }).count;
}

export function createUsernameChangeRequest(
  db: Database.Database,
  userId: string,
  requestedUsername: string
): { success: boolean; error?: string; request?: UsernameChangeRequest } {
  if (!isValidUsername(requestedUsername)) {
    return { success: false, error: 'Username must be 3–24 alphanumeric characters' };
  }

  const user = db.prepare('SELECT id, username FROM users WHERE id = ? AND isDeleted = 0').get(userId) as
    { id: string; username: string } | undefined;
  if (!user) {return { success: false, error: 'User not found' };}

  if (requestedUsername.toLowerCase() === user.username.toLowerCase()) {
    return { success: false, error: 'That is already your username' };
  }

  if (getUserByUsername(db, requestedUsername)) {
    return { success: false, error: 'Username already taken' };
  }

  const pending = getPendingUsernameChangeForUser(db, userId);
  if (pending) {
    return { success: false, error: 'You already have a pending username change request' };
  }

  const takenByRequest = db.prepare(`
    SELECT id FROM username_change_requests
    WHERE requestedUsername = ? AND status = 'new'
  `).get(requestedUsername) as { id: string } | undefined;
  if (takenByRequest) {
    return { success: false, error: 'Username already requested by another user' };
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO username_change_requests (id, userId, requestedUsername, status)
    VALUES (?, ?, ?, 'new')
  `).run(id, userId, requestedUsername);

  const request = db.prepare('SELECT * FROM username_change_requests WHERE id = ?').get(id) as UsernameChangeRequest;
  return { success: true, request };
}

export function approveUsernameChangeRequest(
  db: Database.Database,
  requestId: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string } {
  const request = db.prepare('SELECT * FROM username_change_requests WHERE id = ?').get(requestId) as
    UsernameChangeRequest | undefined;
  if (!request) {return { success: false, error: 'Request not found' };}
  if (request.status !== 'new') {return { success: false, error: 'Request is no longer pending' };}

  const user = db.prepare('SELECT id, username FROM users WHERE id = ? AND isDeleted = 0').get(request.userId) as
    { id: string; username: string } | undefined;
  if (!user) {return { success: false, error: 'User not found' };}

  if (getUserByUsername(db, request.requestedUsername)) {
    return { success: false, error: 'Username is no longer available' };
  }

  updateUser(db, request.userId, { username: request.requestedUsername });
  db.prepare(`
    UPDATE username_change_requests
    SET status = 'approved', reviewedByUserId = ?, reviewedAt = datetime('now'), reason = ?
    WHERE id = ?
  `).run(actorUserId, reason ?? null, requestId);

  writeAuditLog(db, {
    actorUserId,
    targetType: 'user',
    targetId: request.userId,
    action: 'username_change',
    reason: reason ?? `Approved change from ${user.username} to ${request.requestedUsername}`,
  });

  return { success: true };
}

export function rejectPendingUsernameRequestsForUser(
  db: Database.Database,
  userId: string,
  actorUserId: string,
  reason?: string
): void {
  const pending = db.prepare(`
    SELECT id FROM username_change_requests WHERE userId = ? AND status = 'new'
  `).all(userId) as { id: string }[];

  for (const row of pending) {
    rejectUsernameChangeRequest(db, row.id, actorUserId, reason ?? 'Superseded by admin username change');
  }
}

export function rejectUsernameChangeRequest(
  db: Database.Database,
  requestId: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string } {
  const request = db.prepare('SELECT * FROM username_change_requests WHERE id = ?').get(requestId) as
    UsernameChangeRequest | undefined;
  if (!request) {return { success: false, error: 'Request not found' };}
  if (request.status !== 'new') {return { success: false, error: 'Request is no longer pending' };}

  db.prepare(`
    UPDATE username_change_requests
    SET status = 'rejected', reviewedByUserId = ?, reviewedAt = datetime('now'), reason = ?
    WHERE id = ?
  `).run(actorUserId, reason ?? null, requestId);

  writeAuditLog(db, {
    actorUserId,
    targetType: 'user',
    targetId: request.userId,
    action: 'username_change_reject',
    reason,
  });

  return { success: true };
}
