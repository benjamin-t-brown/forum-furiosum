import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { ModerationAuditLog, ApprovalStatus, TargetType, PaginatedResult } from '../models';
import { isValidStatusTransition } from './threads';
import { listPendingUsernameChangeRequests } from './usernameChanges';
import { AUTHOR_USERNAME_SQL } from '../utils/authorDisplay';

export interface PendingApprovalDetails {
  counts: { threads: number; posts: number; usernameChanges: number };
  threads: Array<{
    id: string;
    title: string;
    createdAt: string;
    authorUsername: string;
    categoryName: string;
  }>;
  posts: Array<{
    id: string;
    threadId: string;
    threadTitle: string;
    createdAt: string;
    authorUsername: string;
  }>;
  usernameChanges: Array<{
    id: string;
    userId: string;
    currentUsername: string;
    requestedUsername: string;
    createdAt: string;
  }>;
}

export function writeAuditLog(
  db: Database.Database,
  data: {
    actorUserId: string;
    targetType: TargetType;
    targetId: string;
    action: string;
    reason?: string;
  }
): ModerationAuditLog {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO moderation_audit_log (id, actorUserId, targetType, targetId, action, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.actorUserId, data.targetType, data.targetId, data.action, data.reason ?? null);
  return db.prepare('SELECT * FROM moderation_audit_log WHERE id = ?').get(id) as ModerationAuditLog;
}

export function getAuditLog(
  db: Database.Database,
  options: { page?: number; limit?: number; targetType?: TargetType; targetId?: string } = {}
): PaginatedResult<ModerationAuditLog & {
  actorUsername: string;
  targetLabel: string | null;
  targetUrl: string | null;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const filters: string[] = [];
  const params: unknown[] = [];

  if (options.targetType) { filters.push('m.targetType = ?'); params.push(options.targetType); }
  if (options.targetId) { filters.push('m.targetId = ?'); params.push(options.targetId); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM moderation_audit_log m ${where}`
  ).get(...params) as { total: number };

  const data = db.prepare(`
    SELECT
      m.*,
      u.username as actorUsername,
      CASE m.targetType
        WHEN 'thread' THEN (SELECT title FROM threads WHERE id = m.targetId)
        WHEN 'post' THEN (
          SELECT t.title FROM posts p
          JOIN threads t ON p.threadId = t.id
          WHERE p.id = m.targetId
        )
        WHEN 'user' THEN (SELECT username FROM users WHERE id = m.targetId)
      END as targetLabel,
      CASE m.targetType
        WHEN 'thread' THEN '/threads/' || m.targetId
        WHEN 'post' THEN (
          SELECT '/threads/' || p.threadId FROM posts p WHERE p.id = m.targetId
        )
        WHEN 'user' THEN '/users/' || m.targetId
      END as targetUrl
    FROM moderation_audit_log m
    JOIN users u ON m.actorUserId = u.id
    ${where}
    ORDER BY m.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as (ModerationAuditLog & {
    actorUsername: string;
    targetLabel: string | null;
    targetUrl: string | null;
  })[];

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function approveThread(
  db: Database.Database,
  threadId: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string } {
  const thread = db.prepare('SELECT id, approvalStatus FROM threads WHERE id = ?').get(threadId) as { id: string; approvalStatus: ApprovalStatus } | undefined;
  if (!thread) {return { success: false, error: 'Thread not found' };}
  if (!isValidStatusTransition(thread.approvalStatus, 'approved')) {
    return { success: false, error: `Cannot transition from ${thread.approvalStatus} to approved` };
  }
  db.prepare('UPDATE threads SET approvalStatus = \'approved\', updatedAt = datetime(\'now\') WHERE id = ?').run(threadId);
  writeAuditLog(db, { actorUserId, targetType: 'thread', targetId: threadId, action: 'approve', reason });
  return { success: true };
}

export function hideThread(
  db: Database.Database,
  threadId: string,
  actorUserId: string,
  hide: boolean,
  reason?: string
): { success: boolean; error?: string } {
  const thread = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
  if (!thread) {return { success: false, error: 'Thread not found' };}
  db.prepare('UPDATE threads SET isHidden = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(hide ? 1 : 0, threadId);
  writeAuditLog(db, { actorUserId, targetType: 'thread', targetId: threadId, action: hide ? 'hide' : 'unhide', reason });
  return { success: true };
}

export function lockThread(
  db: Database.Database,
  threadId: string,
  actorUserId: string,
  lock: boolean,
  reason?: string
): { success: boolean; error?: string } {
  const thread = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
  if (!thread) {return { success: false, error: 'Thread not found' };}
  db.prepare('UPDATE threads SET isLocked = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(lock ? 1 : 0, threadId);
  writeAuditLog(db, { actorUserId, targetType: 'thread', targetId: threadId, action: lock ? 'lock' : 'unlock', reason });
  return { success: true };
}

export function approvePost(
  db: Database.Database,
  postId: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string } {
  const post = db.prepare('SELECT id, approvalStatus FROM posts WHERE id = ?').get(postId) as { id: string; approvalStatus: ApprovalStatus } | undefined;
  if (!post) {return { success: false, error: 'Post not found' };}
  if (!isValidStatusTransition(post.approvalStatus, 'approved')) {
    return { success: false, error: `Cannot transition from ${post.approvalStatus} to approved` };
  }
  db.prepare('UPDATE posts SET approvalStatus = \'approved\', updatedAt = datetime(\'now\') WHERE id = ?').run(postId);
  writeAuditLog(db, { actorUserId, targetType: 'post', targetId: postId, action: 'approve', reason });
  return { success: true };
}

export function hidePost(
  db: Database.Database,
  postId: string,
  actorUserId: string,
  hide: boolean,
  reason?: string
): { success: boolean; error?: string } {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) {return { success: false, error: 'Post not found' };}
  db.prepare('UPDATE posts SET isHidden = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(hide ? 1 : 0, postId);
  writeAuditLog(db, { actorUserId, targetType: 'post', targetId: postId, action: hide ? 'hide' : 'unhide', reason });
  return { success: true };
}

export function getPendingApprovals(db: Database.Database): { threads: number; posts: number; usernameChanges: number } {
  const threads = (db.prepare('SELECT COUNT(*) as count FROM threads WHERE approvalStatus = \'new\' AND isDeleted = 0').get() as { count: number }).count;
  const posts = (db.prepare('SELECT COUNT(*) as count FROM posts WHERE approvalStatus = \'new\' AND isDeleted = 0').get() as { count: number }).count;
  const usernameChanges = (db.prepare("SELECT COUNT(*) as count FROM username_change_requests WHERE status = 'new'").get() as { count: number }).count;
  return { threads, posts, usernameChanges };
}

export function listPendingApprovalDetails(db: Database.Database): PendingApprovalDetails {
  const counts = getPendingApprovals(db);

  const threads = db.prepare(`
    SELECT t.id, t.title, t.createdAt, ${AUTHOR_USERNAME_SQL}, c.name as categoryName
    FROM threads t
    JOIN users u ON t.authorUserId = u.id
    JOIN categories c ON t.categoryId = c.id
    WHERE t.approvalStatus = 'new' AND t.isDeleted = 0
    ORDER BY t.createdAt ASC
  `).all() as PendingApprovalDetails['threads'];

  const posts = db.prepare(`
    SELECT p.id, p.threadId, p.createdAt, ${AUTHOR_USERNAME_SQL}, th.title as threadTitle
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    JOIN threads th ON p.threadId = th.id
    WHERE p.approvalStatus = 'new' AND p.isDeleted = 0
    ORDER BY p.createdAt ASC
  `).all() as PendingApprovalDetails['posts'];

  const usernameChanges = listPendingUsernameChangeRequests(db, 500).map((r) => ({
    id: r.id,
    userId: r.userId,
    currentUsername: r.currentUsername,
    requestedUsername: r.requestedUsername,
    createdAt: r.createdAt,
  }));

  return { counts, threads, posts, usernameChanges };
}
