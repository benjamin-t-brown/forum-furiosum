import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { vi } from 'vitest';
import { createTestDb } from './helpers/db';
import { apiRouter } from '../routes/api';
import { sessionMiddleware } from '../middleware/session';
import { requestId } from '../middleware/requestId';
import { csrfMiddleware } from '../middleware/csrf';
import { createUser } from '../services/auth';
import { createThread } from '../services/threads';
import { createPost, updatePost } from '../services/posts';
import { writeAuditLog } from '../services/moderation';
import { updateUser, adminSetUsername } from '../services/users';
import * as dbModule from '../db/db';

describe('GET /api/v1/internal/pending', () => {
  let db: Database.Database;
  let app: express.Express;
  const categoryId = '00000000-0000-0000-0000-000000000001';
  const originalSecret = process.env.MODERATION_POLL_SECRET;

  beforeAll(async () => {
    process.env.MODERATION_POLL_SECRET = 'test-poll-secret';
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    const user = await createUser(db, 'polluser', 'poll@example.com', 'password123');
    const thread = createThread(db, {
      categoryId,
      authorUserId: user.id,
      title: 'Pending Thread',
      body: 'Needs review',
    });
    createPost(db, {
      threadId: thread.id,
      authorUserId: user.id,
      body: 'Pending reply',
    });

    app = express();
    app.use(express.json());
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/api/v1', apiRouter);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.MODERATION_POLL_SECRET;
    } else {
      process.env.MODERATION_POLL_SECRET = originalSecret;
    }
  });

  it('returns 404 when the poll secret is not configured', async () => {
    process.env.MODERATION_POLL_SECRET = '';
    const res = await request(app)
      .get('/api/v1/internal/pending')
      .set('Authorization', 'Bearer test-poll-secret');
    process.env.MODERATION_POLL_SECRET = 'test-poll-secret';
    expect(res.status).toBe(404);
  });

  it('returns 401 without a valid secret', async () => {
    const res = await request(app).get('/api/v1/internal/pending');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns pending item details with a valid bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/internal/pending')
      .set('Authorization', 'Bearer test-poll-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.counts.threads).toBeGreaterThanOrEqual(1);
    expect(res.body.data.counts.posts).toBeGreaterThanOrEqual(1);
    expect(res.body.data.threads[0]).toMatchObject({
      title: 'Pending Thread',
      authorUsername: 'polluser',
    });
    expect(res.body.data.posts[0]).toMatchObject({
      threadTitle: 'Pending Thread',
      authorUsername: 'polluser',
    });
  });

  it('accepts the secret via X-Moderation-Poll-Secret', async () => {
    const res = await request(app)
      .get('/api/v1/internal/pending')
      .set('X-Moderation-Poll-Secret', 'test-poll-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /api/v1/internal/events', () => {
  let db: Database.Database;
  let app: express.Express;
  let userId: string;
  let adminId: string;
  let threadId: string;
  let postId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';
  const originalSecret = process.env.MODERATION_POLL_SECRET;
  const since = '2020-01-01T00:00:00.000Z';
  const until = '2030-01-01T00:00:00.000Z';

  beforeAll(async () => {
    process.env.MODERATION_POLL_SECRET = 'test-poll-secret';
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    const user = await createUser(db, 'eventuser', 'event@example.com', 'password123');
    userId = user.id;
    const admin = await createUser(db, 'eventadmin', 'eventadmin@example.com', 'password123', 'admin');
    adminId = admin.id;

    const thread = createThread(db, {
      categoryId,
      authorUserId: userId,
      title: 'Event Thread',
      body: 'Thread body',
    });
    threadId = thread.id;

    const post = createPost(db, {
      threadId,
      authorUserId: userId,
      body: 'Event reply',
    });
    postId = post.id;

    updatePost(db, postId, { body: 'Edited event reply', lastEditedByUserId: adminId });
    db.prepare("UPDATE posts SET lastEditedAt = datetime('now', '+1 minute') WHERE id = ?").run(postId);

    updateUser(db, userId, { role: 'moderator' });
    writeAuditLog(db, {
      actorUserId: adminId,
      targetType: 'user',
      targetId: userId,
      action: 'role_change',
      reason: 'Changed role from user to moderator',
    });

    adminSetUsername(db, userId, 'eventuser2', adminId);

    writeAuditLog(db, {
      actorUserId: adminId,
      targetType: 'post',
      targetId: postId,
      action: 'delete',
      reason: 'Spam reply',
    });

    const deleteThread = createThread(db, {
      categoryId,
      authorUserId: userId,
      title: 'Deleted Thread',
      body: 'To be deleted',
    });
    writeAuditLog(db, {
      actorUserId: adminId,
      targetType: 'thread',
      targetId: deleteThread.id,
      action: 'delete',
      reason: 'Off-topic',
    });

    app = express();
    app.use(express.json());
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/api/v1', apiRouter);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.MODERATION_POLL_SECRET;
    } else {
      process.env.MODERATION_POLL_SECRET = originalSecret;
    }
  });

  it('returns 400 without since', async () => {
    const res = await request(app)
      .get('/api/v1/internal/events')
      .set('Authorization', 'Bearer test-poll-secret');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 401 without a valid secret', async () => {
    const res = await request(app)
      .get(`/api/v1/internal/events?since=${encodeURIComponent(since)}`);
    expect(res.status).toBe(401);
  });

  it('returns notification events in the requested date range', async () => {
    const res = await request(app)
      .get(`/api/v1/internal/events?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`)
      .set('Authorization', 'Bearer test-poll-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.since).toBe(since);
    expect(res.body.data.until).toBe(until);

    const events = res.body.data.events;
    const types = events.map((event: { type: string }) => event.type);

    expect(types).toContain('thread_created');
    expect(types).toContain('comment_created');
    expect(types).toContain('post_edited');
    expect(types).toContain('post_deleted');
    expect(types).toContain('thread_deleted');
    expect(types).toContain('approval_required');
    expect(types).toContain('user_created');
    expect(types).toContain('user_role_changed');
    expect(types).toContain('username_changed');

    const threadEvent = events.find((event: { id: string }) => event.id === `thread_created:${threadId}`);
    expect(threadEvent).toMatchObject({
      type: 'thread_created',
      threadId,
      title: 'Event Thread',
      authorUsername: 'eventuser2',
    });

    const commentEvent = events.find((event: { id: string }) => event.id === `comment_created:${postId}`);
    expect(commentEvent).toMatchObject({
      type: 'comment_created',
      postId,
      threadId,
      authorUsername: 'eventuser2',
    });

    const editedPost = events.find((event: { type: string; postId: string }) =>
      event.type === 'post_edited' && event.postId === postId
    );
    expect(editedPost).toMatchObject({
      type: 'post_edited',
      postId,
      threadId,
      authorUsername: 'eventuser2',
      editorUsername: 'eventadmin',
    });

    const roleEvent = events.find((event: { type: string }) => event.type === 'user_role_changed');
    expect(roleEvent).toMatchObject({
      userId,
      username: 'eventuser2',
      previousRole: 'user',
      newRole: 'moderator',
      actorUsername: 'eventadmin',
    });

    const postDeletedEvent = events.find((event: { type: string; postId: string }) =>
      event.type === 'post_deleted' && event.postId === postId
    );
    expect(postDeletedEvent).toMatchObject({
      type: 'post_deleted',
      postId,
      threadId,
      authorUsername: 'eventuser2',
      initiatedByUsername: 'eventadmin',
      reason: 'Spam reply',
      postBodyPreview: 'Edited event reply',
    });

    const threadDeletedEvent = events.find((event: { type: string }) => event.type === 'thread_deleted');
    expect(threadDeletedEvent).toMatchObject({
      title: 'Deleted Thread',
      authorUsername: 'eventuser2',
      initiatedByUsername: 'eventadmin',
      reason: 'Off-topic',
    });

    const usernameEvent = events.find((event: { type: string }) => event.type === 'username_changed');
    expect(usernameEvent).toMatchObject({
      userId,
      username: 'eventuser2',
      previousUsername: 'eventuser',
      initiatedByUsername: 'eventadmin',
      reason: 'Changed username from eventuser to eventuser2',
    });
  });

  it('filters by event type', async () => {
    const res = await request(app)
      .get(`/api/v1/internal/events?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&types=comment_created`)
      .set('Authorization', 'Bearer test-poll-secret');

    expect(res.status).toBe(200);
    expect(res.body.data.events.every((event: { type: string }) => event.type === 'comment_created')).toBe(true);
    expect(res.body.data.events.some((event: { id: string }) => event.id === `comment_created:${postId}`)).toBe(true);
  });

  it('returns 400 for invalid types', async () => {
    const res = await request(app)
      .get(`/api/v1/internal/events?since=${encodeURIComponent(since)}&types=not_a_real_type`)
      .set('Authorization', 'Bearer test-poll-secret');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
