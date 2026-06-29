import Database from 'better-sqlite3';
import { AUTHOR_USERNAME_SQL, EDITOR_USERNAME_SQL } from '../utils/authorDisplay';

export type NotificationEventType =
  | 'thread_created'
  | 'comment_created'
  | 'post_edited'
  | 'post_deleted'
  | 'thread_deleted'
  | 'approval_required'
  | 'user_created'
  | 'user_role_changed'
  | 'username_changed';

export type ApprovalRequiredKind = 'thread' | 'post' | 'username_change';

interface NotificationEventBase {
  id: string;
  type: NotificationEventType;
  occurredAt: string;
}

export type NotificationEvent =
  | (NotificationEventBase & {
      type: 'thread_created';
      threadId: string;
      title: string;
      categoryId: string;
      categoryName: string;
      authorUserId: string;
      authorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'comment_created';
      postId: string;
      threadId: string;
      threadTitle: string;
      authorUserId: string;
      authorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'post_edited';
      postId: string;
      threadId: string;
      threadTitle: string;
      authorUserId: string;
      authorUsername: string;
      editorUserId: string;
      editorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'post_deleted';
      auditLogId: string;
      postId: string;
      threadId: string;
      threadTitle: string;
      authorUserId: string;
      authorUsername: string;
      initiatedByUserId: string;
      initiatedByUsername: string;
      reason: string | null;
      postBodyPreview: string | null;
    })
  | (NotificationEventBase & {
      type: 'thread_deleted';
      auditLogId: string;
      threadId: string;
      title: string;
      categoryId: string;
      categoryName: string;
      authorUserId: string;
      authorUsername: string;
      initiatedByUserId: string;
      initiatedByUsername: string;
      reason: string | null;
    })
  | (NotificationEventBase & {
      type: 'approval_required';
      kind: 'thread';
      threadId: string;
      title: string;
      categoryName: string;
      authorUserId: string;
      authorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'approval_required';
      kind: 'post';
      postId: string;
      threadId: string;
      threadTitle: string;
      authorUserId: string;
      authorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'approval_required';
      kind: 'username_change';
      requestId: string;
      userId: string;
      currentUsername: string;
      requestedUsername: string;
    })
  | (NotificationEventBase & {
      type: 'user_created';
      userId: string;
      username: string;
      role: string;
    })
  | (NotificationEventBase & {
      type: 'user_role_changed';
      auditLogId: string;
      userId: string;
      username: string;
      previousRole: string | null;
      newRole: string;
      actorUserId: string;
      actorUsername: string;
    })
  | (NotificationEventBase & {
      type: 'username_changed';
      auditLogId: string;
      userId: string;
      username: string;
      previousUsername: string | null;
      initiatedByUserId: string;
      initiatedByUsername: string;
      reason: string | null;
    });

export interface ListNotificationEventsOptions {
  since: string;
  until: string;
  types?: NotificationEventType[];
  limit?: number;
}

export interface NotificationEventsResult {
  since: string;
  until: string;
  events: NotificationEvent[];
}

const ALL_EVENT_TYPES: NotificationEventType[] = [
  'thread_created',
  'comment_created',
  'post_edited',
  'post_deleted',
  'thread_deleted',
  'approval_required',
  'user_created',
  'user_role_changed',
  'username_changed',
];

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function dateRangeClause(column: string): string {
  return `datetime(${column}) >= datetime(?) AND datetime(${column}) < datetime(?)`;
}

function parseRoleChangeReason(reason: string | null): { previousRole: string | null; newRole: string | null } {
  if (!reason) {return { previousRole: null, newRole: null };}
  const match = reason.match(/from\s+(\w+)\s+to\s+(\w+)/i);
  if (!match) {return { previousRole: null, newRole: null };}
  return { previousRole: match[1], newRole: match[2] };
}

function parseUsernameChangeReason(reason: string | null): { previousUsername: string | null; newUsername: string | null } {
  if (!reason) {return { previousUsername: null, newUsername: null };}
  const fromTo = reason.match(/from\s+(.+?)\s+to\s+(.+)/i);
  if (fromTo) {return { previousUsername: fromTo[1], newUsername: fromTo[2] };}
  const setTo = reason.match(/(?:set username to|approved change to)\s+(.+)/i);
  if (setTo) {return { previousUsername: null, newUsername: setTo[1] };}
  return { previousUsername: null, newUsername: null };
}

function previewText(text: string | null | undefined, max = 120): string | null {
  if (!text?.trim()) {return null;}
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {return normalized;}
  return `${normalized.slice(0, max - 1)}…`;
}

export function listNotificationEvents(
  db: Database.Database,
  options: ListNotificationEventsOptions
): NotificationEventsResult {
  const types = options.types?.length ? options.types : ALL_EVENT_TYPES;
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  const events: NotificationEvent[] = [];

  if (types.includes('thread_created')) {
    const rows = db.prepare(`
      SELECT t.id, t.title, t.categoryId, t.createdAt, t.authorUserId, ${AUTHOR_USERNAME_SQL}, c.name as categoryName
      FROM threads t
      JOIN users u ON t.authorUserId = u.id
      JOIN categories c ON t.categoryId = c.id
      WHERE ${dateRangeClause('t.createdAt')} AND t.isDeleted = 0
    `).all(options.since, options.until) as Array<{
      id: string;
      title: string;
      categoryId: string;
      createdAt: string;
      authorUserId: string;
      authorUsername: string;
      categoryName: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `thread_created:${row.id}`,
        type: 'thread_created',
        occurredAt: row.createdAt,
        threadId: row.id,
        title: row.title,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
      });
    }
  }

  if (types.includes('comment_created')) {
    const rows = db.prepare(`
      SELECT p.id, p.threadId, p.createdAt, p.authorUserId, ${AUTHOR_USERNAME_SQL}, th.title as threadTitle
      FROM posts p
      JOIN users u ON p.authorUserId = u.id
      JOIN threads th ON p.threadId = th.id
      WHERE ${dateRangeClause('p.createdAt')} AND p.isDeleted = 0
    `).all(options.since, options.until) as Array<{
      id: string;
      threadId: string;
      createdAt: string;
      authorUserId: string;
      authorUsername: string;
      threadTitle: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `comment_created:${row.id}`,
        type: 'comment_created',
        occurredAt: row.createdAt,
        postId: row.id,
        threadId: row.threadId,
        threadTitle: row.threadTitle,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
      });
    }
  }

  if (types.includes('post_edited')) {
    const rows = db.prepare(`
      SELECT
        p.id,
        p.threadId,
        p.lastEditedAt,
        p.authorUserId,
        p.lastEditedByUserId as editorUserId,
        ${AUTHOR_USERNAME_SQL},
        ${EDITOR_USERNAME_SQL},
        th.title as threadTitle
      FROM posts p
      JOIN users u ON p.authorUserId = u.id
      JOIN users editor ON p.lastEditedByUserId = editor.id
      JOIN threads th ON p.threadId = th.id
      WHERE ${dateRangeClause('p.lastEditedAt')}
        AND p.isDeleted = 0
        AND p.lastEditedByUserId IS NOT NULL
        AND p.lastEditedAt > p.createdAt
    `).all(options.since, options.until) as Array<{
      id: string;
      threadId: string;
      lastEditedAt: string;
      authorUserId: string;
      editorUserId: string;
      authorUsername: string;
      editorUsername: string;
      threadTitle: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `post_edited:${row.id}:${row.lastEditedAt}`,
        type: 'post_edited',
        occurredAt: row.lastEditedAt,
        postId: row.id,
        threadId: row.threadId,
        threadTitle: row.threadTitle,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
        editorUserId: row.editorUserId,
        editorUsername: row.editorUsername,
      });
    }
  }

  if (types.includes('approval_required')) {
    const threads = db.prepare(`
      SELECT t.id, t.title, t.createdAt, t.authorUserId, ${AUTHOR_USERNAME_SQL}, c.name as categoryName
      FROM threads t
      JOIN users u ON t.authorUserId = u.id
      JOIN categories c ON t.categoryId = c.id
      WHERE ${dateRangeClause('t.createdAt')} AND t.isDeleted = 0
        AND (
          t.approvalStatus = 'new'
          OR EXISTS (
            SELECT 1 FROM moderation_audit_log m
            WHERE m.targetType = 'thread' AND m.targetId = t.id AND m.action = 'approve'
          )
        )
    `).all(options.since, options.until) as Array<{
      id: string;
      title: string;
      createdAt: string;
      authorUserId: string;
      authorUsername: string;
      categoryName: string;
    }>;

    for (const row of threads) {
      events.push({
        id: `approval_required:thread:${row.id}`,
        type: 'approval_required',
        kind: 'thread',
        occurredAt: row.createdAt,
        threadId: row.id,
        title: row.title,
        categoryName: row.categoryName,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
      });
    }

    const posts = db.prepare(`
      SELECT p.id, p.threadId, p.createdAt, p.authorUserId, ${AUTHOR_USERNAME_SQL}, th.title as threadTitle
      FROM posts p
      JOIN users u ON p.authorUserId = u.id
      JOIN threads th ON p.threadId = th.id
      WHERE ${dateRangeClause('p.createdAt')} AND p.isDeleted = 0
        AND (
          p.approvalStatus = 'new'
          OR EXISTS (
            SELECT 1 FROM moderation_audit_log m
            WHERE m.targetType = 'post' AND m.targetId = p.id AND m.action = 'approve'
          )
        )
    `).all(options.since, options.until) as Array<{
      id: string;
      threadId: string;
      createdAt: string;
      authorUserId: string;
      authorUsername: string;
      threadTitle: string;
    }>;

    for (const row of posts) {
      events.push({
        id: `approval_required:post:${row.id}`,
        type: 'approval_required',
        kind: 'post',
        occurredAt: row.createdAt,
        postId: row.id,
        threadId: row.threadId,
        threadTitle: row.threadTitle,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
      });
    }

    const usernameChanges = db.prepare(`
      SELECT r.id, r.userId, r.requestedUsername, r.createdAt, u.username as currentUsername
      FROM username_change_requests r
      JOIN users u ON r.userId = u.id
      WHERE ${dateRangeClause('r.createdAt')}
    `).all(options.since, options.until) as Array<{
      id: string;
      userId: string;
      requestedUsername: string;
      createdAt: string;
      currentUsername: string;
    }>;

    for (const row of usernameChanges) {
      events.push({
        id: `approval_required:username_change:${row.id}`,
        type: 'approval_required',
        kind: 'username_change',
        occurredAt: row.createdAt,
        requestId: row.id,
        userId: row.userId,
        currentUsername: row.currentUsername,
        requestedUsername: row.requestedUsername,
      });
    }
  }

  if (types.includes('user_created')) {
    const rows = db.prepare(`
      SELECT id, username, role, createdAt
      FROM users
      WHERE ${dateRangeClause('createdAt')} AND isDeleted = 0 AND isEphemeral = 0
    `).all(options.since, options.until) as Array<{
      id: string;
      username: string;
      role: string;
      createdAt: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `user_created:${row.id}`,
        type: 'user_created',
        occurredAt: row.createdAt,
        userId: row.id,
        username: row.username,
        role: row.role,
      });
    }
  }

  if (types.includes('post_deleted')) {
    const rows = db.prepare(`
      SELECT
        m.id,
        m.targetId as postId,
        m.actorUserId,
        m.reason,
        m.createdAt,
        actor.username as initiatedByUsername,
        p.threadId,
        p.body as postBody,
        p.authorUserId,
        ${AUTHOR_USERNAME_SQL},
        th.title as threadTitle
      FROM moderation_audit_log m
      JOIN users actor ON m.actorUserId = actor.id
      JOIN posts p ON m.targetId = p.id
      JOIN users u ON p.authorUserId = u.id
      JOIN threads th ON p.threadId = th.id
      WHERE m.targetType = 'post'
        AND m.action = 'delete'
        AND ${dateRangeClause('m.createdAt')}
    `).all(options.since, options.until) as Array<{
      id: string;
      postId: string;
      actorUserId: string;
      reason: string | null;
      createdAt: string;
      initiatedByUsername: string;
      threadId: string;
      postBody: string;
      authorUserId: string;
      authorUsername: string;
      threadTitle: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `post_deleted:${row.id}`,
        type: 'post_deleted',
        occurredAt: row.createdAt,
        auditLogId: row.id,
        postId: row.postId,
        threadId: row.threadId,
        threadTitle: row.threadTitle,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
        initiatedByUserId: row.actorUserId,
        initiatedByUsername: row.initiatedByUsername,
        reason: row.reason,
        postBodyPreview: previewText(row.postBody),
      });
    }
  }

  if (types.includes('thread_deleted')) {
    const rows = db.prepare(`
      SELECT
        m.id,
        m.targetId as threadId,
        m.actorUserId,
        m.reason,
        m.createdAt,
        actor.username as initiatedByUsername,
        t.title,
        t.categoryId,
        t.authorUserId,
        ${AUTHOR_USERNAME_SQL},
        c.name as categoryName
      FROM moderation_audit_log m
      JOIN users actor ON m.actorUserId = actor.id
      JOIN threads t ON m.targetId = t.id
      JOIN users u ON t.authorUserId = u.id
      JOIN categories c ON t.categoryId = c.id
      WHERE m.targetType = 'thread'
        AND m.action = 'delete'
        AND ${dateRangeClause('m.createdAt')}
    `).all(options.since, options.until) as Array<{
      id: string;
      threadId: string;
      actorUserId: string;
      reason: string | null;
      createdAt: string;
      initiatedByUsername: string;
      title: string;
      categoryId: string;
      authorUserId: string;
      authorUsername: string;
      categoryName: string;
    }>;

    for (const row of rows) {
      events.push({
        id: `thread_deleted:${row.id}`,
        type: 'thread_deleted',
        occurredAt: row.createdAt,
        auditLogId: row.id,
        threadId: row.threadId,
        title: row.title,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        authorUserId: row.authorUserId,
        authorUsername: row.authorUsername,
        initiatedByUserId: row.actorUserId,
        initiatedByUsername: row.initiatedByUsername,
        reason: row.reason,
      });
    }
  }

  if (types.includes('username_changed')) {
    const rows = db.prepare(`
      SELECT
        m.id,
        m.targetId as userId,
        m.actorUserId,
        m.reason,
        m.createdAt,
        target.username as username,
        actor.username as initiatedByUsername
      FROM moderation_audit_log m
      JOIN users target ON m.targetId = target.id
      JOIN users actor ON m.actorUserId = actor.id
      WHERE m.targetType = 'user'
        AND m.action = 'username_change'
        AND ${dateRangeClause('m.createdAt')}
    `).all(options.since, options.until) as Array<{
      id: string;
      userId: string;
      actorUserId: string;
      reason: string | null;
      createdAt: string;
      username: string;
      initiatedByUsername: string;
    }>;

    for (const row of rows) {
      const parsed = parseUsernameChangeReason(row.reason);
      events.push({
        id: `username_changed:${row.id}`,
        type: 'username_changed',
        occurredAt: row.createdAt,
        auditLogId: row.id,
        userId: row.userId,
        username: parsed.newUsername ?? row.username,
        previousUsername: parsed.previousUsername,
        initiatedByUserId: row.actorUserId,
        initiatedByUsername: row.initiatedByUsername,
        reason: row.reason,
      });
    }
  }

  if (types.includes('user_role_changed')) {
    const rows = db.prepare(`
      SELECT
        m.id,
        m.targetId as userId,
        m.actorUserId,
        m.reason,
        m.createdAt,
        target.username as username,
        target.role as newRole,
        actor.username as actorUsername
      FROM moderation_audit_log m
      JOIN users target ON m.targetId = target.id
      JOIN users actor ON m.actorUserId = actor.id
      WHERE m.targetType = 'user'
        AND m.action = 'role_change'
        AND ${dateRangeClause('m.createdAt')}
    `).all(options.since, options.until) as Array<{
      id: string;
      userId: string;
      actorUserId: string;
      reason: string | null;
      createdAt: string;
      username: string;
      newRole: string;
      actorUsername: string;
    }>;

    for (const row of rows) {
      const parsed = parseRoleChangeReason(row.reason);
      events.push({
        id: `user_role_changed:${row.id}`,
        type: 'user_role_changed',
        occurredAt: row.createdAt,
        auditLogId: row.id,
        userId: row.userId,
        username: row.username,
        previousRole: parsed.previousRole,
        newRole: parsed.newRole ?? row.newRole,
        actorUserId: row.actorUserId,
        actorUsername: row.actorUsername,
      });
    }
  }

  events.sort((a, b) => {
    const byTime = a.occurredAt.localeCompare(b.occurredAt);
    if (byTime !== 0) {return byTime;}
    return a.id.localeCompare(b.id);
  });

  return {
    since: options.since,
    until: options.until,
    events: events.slice(0, limit),
  };
}
