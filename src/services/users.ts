import Database from 'better-sqlite3';
import type { User, PaginatedResult } from '../models';

export function getUserById(db: Database.Database, id: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0').get(id) as User | undefined) ?? null;
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

export function searchUsers(db: Database.Database, query: string): User[] {
  const q = `%${query}%`;
  return db.prepare(
    'SELECT * FROM users WHERE (username LIKE ? OR email LIKE ?) AND isDeleted = 0 LIMIT 20'
  ).all(q, q) as User[];
}
