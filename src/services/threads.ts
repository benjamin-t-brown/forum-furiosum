import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Thread, PaginatedResult, UserRole, ApprovalStatus } from '../models';

function visibilityWhere(role: UserRole | undefined): string {
  if (role === 'admin' || role === 'moderator') {return '';}
  return 'AND t.approvalStatus = \'approved\' AND t.isHidden = 0 AND t.isDeleted = 0';
}

export function listThreads(
  db: Database.Database,
  options: {
    categoryId?: string;
    page?: number;
    limit?: number;
    role?: UserRole;
  } = {}
): PaginatedResult<Thread & { authorUsername: string; categoryName: string; postCount: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const vis = visibilityWhere(options.role);

  const categoryFilter = options.categoryId ? 'AND t.categoryId = ?' : '';
  const params: unknown[] = [];
  if (options.categoryId) {params.push(options.categoryId);}

  const countSql = `
    SELECT COUNT(*) as total FROM threads t
    WHERE 1=1 ${vis} ${categoryFilter}
  `;
  const { total } = db.prepare(countSql).get(...params) as { total: number };

  const sql = `
    SELECT t.*, u.username as authorUsername, c.name as categoryName,
      (SELECT COUNT(*) FROM posts p WHERE p.threadId = t.id AND p.isDeleted = 0) as postCount
    FROM threads t
    JOIN users u ON t.authorUserId = u.id
    JOIN categories c ON t.categoryId = c.id
    WHERE 1=1 ${vis} ${categoryFilter}
    ORDER BY t.updatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const data = db.prepare(sql).all(...params, limit, offset) as (Thread & { authorUsername: string; categoryName: string; postCount: number })[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function getThreadById(
  db: Database.Database,
  id: string,
  role?: UserRole
): (Thread & { authorUsername: string; categoryName: string }) | null {
  const vis = visibilityWhere(role);
  const sql = `
    SELECT t.*, u.username as authorUsername, c.name as categoryName
    FROM threads t
    JOIN users u ON t.authorUserId = u.id
    JOIN categories c ON t.categoryId = c.id
    WHERE t.id = ? ${vis}
  `;
  return (db.prepare(sql).get(id) as (Thread & { authorUsername: string; categoryName: string }) | undefined) ?? null;
}

export function getEmbedThreadById(
  db: Database.Database,
  id: string
): (Thread & { authorUsername: string; categoryName: string }) | null {
  const sql = `
    SELECT t.*, u.username as authorUsername, c.name as categoryName
    FROM threads t
    JOIN users u ON t.authorUserId = u.id
    JOIN categories c ON t.categoryId = c.id
    WHERE t.id = ? AND t.embedEnabled = 1 AND t.isDeleted = 0
  `;
  return (db.prepare(sql).get(id) as (Thread & { authorUsername: string; categoryName: string }) | undefined) ?? null;
}

export function createThread(
  db: Database.Database,
  data: { categoryId: string; authorUserId: string; title: string; body: string }
): Thread {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO threads (id, categoryId, authorUserId, title, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.categoryId, data.authorUserId, data.title, data.body);
  return db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Thread;
}

export function updateThread(
  db: Database.Database,
  id: string,
  data: Partial<Pick<Thread, 'title' | 'body' | 'isHidden' | 'isDeleted' | 'approvalStatus' | 'categoryId' | 'embedEnabled'>> & {
    lastEditedByUserId?: string;
    lastEditedReason?: string;
  }
): Thread | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.categoryId !== undefined) { fields.push('categoryId = ?'); values.push(data.categoryId); }
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.body !== undefined) { fields.push('body = ?'); values.push(data.body); }
  if (data.isHidden !== undefined) { fields.push('isHidden = ?'); values.push(data.isHidden); }
  if (data.isDeleted !== undefined) { fields.push('isDeleted = ?'); values.push(data.isDeleted); }
  if (data.approvalStatus !== undefined) { fields.push('approvalStatus = ?'); values.push(data.approvalStatus); }
  if (data.embedEnabled !== undefined) { fields.push('embedEnabled = ?'); values.push(data.embedEnabled); }
  if (data.lastEditedByUserId !== undefined) {
    fields.push('lastEditedByUserId = ?', 'lastEditedAt = datetime(\'now\')');
    values.push(data.lastEditedByUserId);
    if (data.lastEditedReason !== undefined) { fields.push('lastEditedReason = ?'); values.push(data.lastEditedReason); }
  }

  if (fields.length === 0) {return db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Thread ?? null;}

  fields.push('updatedAt = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return (db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Thread | undefined) ?? null;
}

export function deleteThread(db: Database.Database, id: string): void {
  db.prepare('UPDATE threads SET isDeleted = 1, updatedAt = datetime(\'now\') WHERE id = ?').run(id);
}

// Validate approval status transitions
export function isValidStatusTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  const allowed: Record<ApprovalStatus, ApprovalStatus[]> = {
    'new': ['approved', 'unapproved', 'unknown'],
    'unknown': ['approved', 'unapproved'],
    'unapproved': ['approved', 'unknown'],
    'approved': ['unapproved'],
  };
  return allowed[from]?.includes(to) ?? false;
}
