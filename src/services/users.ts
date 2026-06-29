import Database from 'better-sqlite3';
import crypto from 'crypto';
import type { User, PaginatedResult } from '../models';
import { hashPassword } from './auth';
import { deleteUserSessions } from './session';
import { writeAuditLog } from './moderation';
import { redactedEmailForId, redactedUsernameForId } from '../utils/authorDisplay';
import { getUsernameValidationError } from '../utils/usernameValidation';
import { getUserByUsername } from './auth';

export function getUserById(db: Database.Database, id: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0').get(id) as User | undefined) ?? null;
}

export function getUserByIdForAdmin(db: Database.Database, id: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
}

export function listUsers(
  db: Database.Database,
  options: { page?: number; limit?: number; includeDeleted?: boolean } = {}
): PaginatedResult<User> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const deletedFilter = options.includeDeleted ? '' : 'WHERE isDeleted = 0';

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM users ${deletedFilter}`).get() as { total: number };
  const data = db.prepare(`SELECT * FROM users ${deletedFilter} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(limit, offset) as User[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function updateUser(
  db: Database.Database,
  id: string,
  data: Partial<Pick<User, 'username' | 'email' | 'role' | 'trust' | 'isDeleted' | 'theme'>> & { passwordHash?: string }
): User | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email.toLowerCase()); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.trust !== undefined) { fields.push('trust = ?'); values.push(data.trust); }
  if (data.isDeleted !== undefined) { fields.push('isDeleted = ?'); values.push(data.isDeleted); }
  if (data.theme !== undefined) { fields.push('theme = ?'); values.push(data.theme); }
  if (data.passwordHash !== undefined) { fields.push('passwordHash = ?'); values.push(data.passwordHash); }

  if (fields.length === 0) {return getUserById(db, id);}

  fields.push('updatedAt = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
}

export function searchUsers(
  db: Database.Database,
  query: string,
  options: { includeDeleted?: boolean; limit?: number } = {}
): User[] {
  const trimmed = query.trim();
  if (!trimmed) {return [];}

  const q = `%${trimmed}%`;
  const deletedFilter = options.includeDeleted ? '' : 'AND isDeleted = 0';
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));

  return db.prepare(
    `SELECT * FROM users WHERE (username LIKE ? OR email LIKE ?) ${deletedFilter} ORDER BY username LIMIT ?`
  ).all(q, q, limit) as User[];
}

export async function deleteAccount(
  db: Database.Database,
  userId: string,
  actorUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND isDeleted = 0').get(userId) as
    { id: string } | undefined;
  if (!user) {return { success: false, error: 'User not found' };}

  const scrambledPassword = await hashPassword(crypto.randomUUID());
  updateUser(db, userId, {
    username: redactedUsernameForId(userId),
    email: redactedEmailForId(userId),
    isDeleted: 1,
    passwordHash: scrambledPassword,
  });

  deleteUserSessions(db, userId);
  writeAuditLog(db, {
    actorUserId,
    targetType: 'user',
    targetId: userId,
    action: 'delete',
    reason,
  });

  return { success: true };
}

export function adminSetUsername(
  db: Database.Database,
  userId: string,
  username: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string } {
  const trimmed = username.trim();
  const usernameError = getUsernameValidationError(trimmed);
  if (usernameError) {
    return { success: false, error: usernameError };
  }

  const user = getUserByIdForAdmin(db, userId);
  if (!user) {return { success: false, error: 'User not found' };}
  if (user.isDeleted) {return { success: false, error: 'Cannot rename a deleted account' };}

  if (trimmed.toLowerCase() === user.username.toLowerCase()) {
    return { success: true };
  }

  const existing = getUserByUsername(db, trimmed);
  if (existing && existing.id !== userId) {
    return { success: false, error: 'Username already taken' };
  }

  updateUser(db, userId, { username: trimmed });
  writeAuditLog(db, {
    actorUserId,
    targetType: 'user',
    targetId: userId,
    action: 'username_change',
    reason: reason ?? `Changed username from ${user.username} to ${trimmed}`,
  });

  return { success: true };
}

export async function adminSetPassword(
  db: Database.Database,
  userId: string,
  password: string,
  actorUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const user = getUserByIdForAdmin(db, userId);
  if (!user) {return { success: false, error: 'User not found' };}
  if (user.isDeleted) {return { success: false, error: 'Cannot change password for a deleted account' };}

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { success: false, error: 'Password must be under 128 characters' };
  }

  const passwordHash = await hashPassword(password);
  updateUser(db, userId, { passwordHash });
  deleteUserSessions(db, userId);
  writeAuditLog(db, {
    actorUserId,
    targetType: 'user',
    targetId: userId,
    action: 'password_change',
    reason: reason ?? 'Admin password reset',
  });

  return { success: true };
}
