import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Post, PaginatedResult, UserRole, ApprovalStatus, UserTrust } from '../models';
import { meetsReplyApprovalTrust, type ReplyApprovalTrust } from '../utils/replyApprovalTrust';
import { AUTHOR_IS_DELETED_SQL, AUTHOR_TRUST_SQL, AUTHOR_USERNAME_SQL, EDITOR_IS_DELETED_SQL, EDITOR_USERNAME_SQL } from '../utils/authorDisplay';

type PostWithAuthors = Post & {
  authorUsername: string;
  authorIsDeleted: 0 | 1;
  authorTrust: UserTrust;
  editorUsername: string | null;
  editorIsDeleted: 0 | 1 | null;
};

function listVisibilityWhere(
  role: UserRole | undefined,
  viewerUserId?: string
): { clause: string; params: unknown[] } {
  if (role === 'admin' || role === 'moderator') {
    return { clause: 'AND p.isDeleted = 0', params: [] };
  }
  if (viewerUserId) {
    return {
      clause: `AND p.isDeleted = 0 AND p.isHidden = 0 AND (p.approvalStatus = 'approved' OR p.authorUserId = ?)`,
      params: [viewerUserId],
    };
  }
  return {
    clause: 'AND p.approvalStatus = \'approved\' AND p.isHidden = 0 AND p.isDeleted = 0',
    params: [],
  };
}

function getByIdVisibilityWhere(
  role: UserRole | undefined,
  viewerUserId?: string
): { clause: string; params: unknown[] } {
  if (role === 'admin' || role === 'moderator') {
    return { clause: '', params: [] };
  }
  if (viewerUserId) {
    return {
      clause: `AND p.isDeleted = 0 AND p.isHidden = 0 AND (p.approvalStatus = 'approved' OR p.authorUserId = ?)`,
      params: [viewerUserId],
    };
  }
  return {
    clause: 'AND p.approvalStatus = \'approved\' AND p.isHidden = 0 AND p.isDeleted = 0',
    params: [],
  };
}

export function listPosts(
  db: Database.Database,
  threadId: string,
  options: { page?: number; limit?: number; role?: UserRole; viewerUserId?: string } = {}
): PaginatedResult<PostWithAuthors> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const { clause: vis, params: visParams } = listVisibilityWhere(options.role, options.viewerUserId);

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM posts p WHERE p.threadId = ? ${vis}`
  ).get(threadId, ...visParams) as { total: number };

  const data = db.prepare(`
    SELECT p.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, ${EDITOR_USERNAME_SQL}, ${EDITOR_IS_DELETED_SQL}
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    LEFT JOIN users editor ON p.lastEditedByUserId = editor.id
    WHERE p.threadId = ? ${vis}
    ORDER BY p.createdAt ASC
    LIMIT ? OFFSET ?
  `).all(threadId, ...visParams, limit, offset) as PostWithAuthors[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function getPostById(
  db: Database.Database,
  id: string,
  role?: UserRole,
  viewerUserId?: string
): PostWithAuthors | null {
  const { clause: vis, params: visParams } = getByIdVisibilityWhere(role, viewerUserId);
  return (db.prepare(`
    SELECT p.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, ${EDITOR_USERNAME_SQL}, ${EDITOR_IS_DELETED_SQL}
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    LEFT JOIN users editor ON p.lastEditedByUserId = editor.id
    WHERE p.id = ? ${vis}
  `).get(id, ...visParams) as PostWithAuthors | undefined) ?? null;
}

export function resolveContentApproval(trust: UserTrust): ApprovalStatus {
  return trust === 'trusted' || trust === 'verified' ? 'approved' : 'new';
}

export function resolveReplyApproval(
  trust: UserTrust,
  replyApprovalTrust: ReplyApprovalTrust | null = null
): ApprovalStatus {
  if (trust === 'banned') {return 'new';}
  if (replyApprovalTrust === null) {return resolveContentApproval(trust);}
  return meetsReplyApprovalTrust(trust, replyApprovalTrust) ? 'approved' : 'new';
}

/** @deprecated Use resolveReplyApproval */
export function resolveEmbedPostApproval(trust: UserTrust): ApprovalStatus {
  return resolveReplyApproval(trust);
}

export function createPost(
  db: Database.Database,
  data: { threadId: string; authorUserId: string; body: string; approvalStatus?: ApprovalStatus }
): Post {
  const id = uuidv4();
  const approvalStatus = data.approvalStatus ?? 'new';
  db.prepare(`
    INSERT INTO posts (id, threadId, authorUserId, body, approvalStatus)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.threadId, data.authorUserId, data.body, approvalStatus);

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
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
  if (!existing) {return null;}

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.body !== undefined) {
    fields.push('body = ?');
    values.push(data.body);
    if (data.lastEditedByUserId !== undefined && data.body !== existing.body) {
      fields.push('lastEditedByUserId = ?', 'lastEditedAt = datetime(\'now\')');
      values.push(data.lastEditedByUserId);
      if (data.lastEditedReason !== undefined) { fields.push('lastEditedReason = ?'); values.push(data.lastEditedReason); }
    }
  }
  if (data.isHidden !== undefined) { fields.push('isHidden = ?'); values.push(data.isHidden); }
  if (data.isDeleted !== undefined) { fields.push('isDeleted = ?'); values.push(data.isDeleted); }
  if (data.approvalStatus !== undefined) { fields.push('approvalStatus = ?'); values.push(data.approvalStatus); }

  if (fields.length === 0) {return (db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined) ?? null;}

  fields.push('updatedAt = datetime(\'now\')');
  values.push(id);

  db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return (db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined) ?? null;
}

export function deletePost(db: Database.Database, id: string): void {
  db.prepare('UPDATE posts SET isDeleted = 1, updatedAt = datetime(\'now\') WHERE id = ?').run(id);
}
