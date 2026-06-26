import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Post, PaginatedResult, UserRole } from '../models';

function visibilityWhere(role: UserRole | undefined): string {
  if (role === 'admin' || role === 'moderator') {return '';}
  return 'AND p.approvalStatus = \'approved\' AND p.isHidden = 0 AND p.isDeleted = 0';
}

export function listPosts(
  db: Database.Database,
  threadId: string,
  options: { page?: number; limit?: number; role?: UserRole } = {}
): PaginatedResult<Post & { authorUsername: string }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const vis = visibilityWhere(options.role);

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM posts p WHERE p.threadId = ? ${vis}`
  ).get(threadId) as { total: number };

  const data = db.prepare(`
    SELECT p.*, u.username as authorUsername
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    WHERE p.threadId = ? ${vis}
    ORDER BY p.createdAt ASC
    LIMIT ? OFFSET ?
  `).all(threadId, limit, offset) as (Post & { authorUsername: string })[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function getPostById(
  db: Database.Database,
  id: string,
  role?: UserRole
): (Post & { authorUsername: string }) | null {
  const vis = visibilityWhere(role);
  return (db.prepare(`
    SELECT p.*, u.username as authorUsername
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    WHERE p.id = ? ${vis}
  `).get(id) as (Post & { authorUsername: string }) | undefined) ?? null;
}

export function createPost(
  db: Database.Database,
  data: { threadId: string; authorUserId: string; body: string }
): Post {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO posts (id, threadId, authorUserId, body)
    VALUES (?, ?, ?, ?)
  `).run(id, data.threadId, data.authorUserId, data.body);

  // Update thread's updatedAt
  db.prepare('UPDATE threads SET updatedAt = datetime(\'now\') WHERE id = ?').run(data.threadId);

  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;
}

export function updatePost(
  db: Database.Database,
  id: string,
  data: Partial<Pick<Post, 'body' | 'isHidden' | 'isDeleted' | 'approvalStatus'>> & {
    lastEditedByUserId?: string;
    lastEditedReason?: string;
  }
): Post | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.body !== undefined) { fields.push('body = ?'); values.push(data.body); }
  if (data.isHidden !== undefined) { fields.push('isHidden = ?'); values.push(data.isHidden); }
  if (data.isDeleted !== undefined) { fields.push('isDeleted = ?'); values.push(data.isDeleted); }
  if (data.approvalStatus !== undefined) { fields.push('approvalStatus = ?'); values.push(data.approvalStatus); }
  if (data.lastEditedByUserId !== undefined) {
    fields.push('lastEditedByUserId = ?', 'lastEditedAt = datetime(\'now\')');
    values.push(data.lastEditedByUserId);
    if (data.lastEditedReason !== undefined) { fields.push('lastEditedReason = ?'); values.push(data.lastEditedReason); }
  }

  if (fields.length === 0) {return (db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined) ?? null;}

  fields.push('updatedAt = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return (db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined) ?? null;
}

export function deletePost(db: Database.Database, id: string): void {
  db.prepare('UPDATE posts SET isDeleted = 1, updatedAt = datetime(\'now\') WHERE id = ?').run(id);
}
