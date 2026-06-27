import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import { createTestDb } from './helpers/db';
import { webRouter } from '../routes/web';
import { sessionMiddleware } from '../middleware/session';
import { requestId } from '../middleware/requestId';
import { csrfMiddleware } from '../middleware/csrf';
import { createUser } from '../services/auth';
import { createThread, updateThread } from '../services/threads';
import { createPost, resolveEmbedPostApproval } from '../services/posts';
import { formatDisplayDate } from '../utils/formatDate';
import * as dbModule from '../db/db';

describe('Embed routes', () => {
  let db: Database.Database;
  let app: express.Express;
  let threadId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    const admin = await createUser(db, 'embedadmin', 'embed@example.com', 'password123', 'admin');
    const thread = createThread(db, {
      categoryId,
      authorUserId: admin.id,
      title: 'Blog Comments Thread',
      body: 'Opening post body hidden in embed',
    });
    threadId = thread.id;

    app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(process.cwd(), 'src/views'));
    app.locals.formatDate = formatDisplayDate;
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/', webRouter);
  });

  it('returns 404 when embedding is not enabled', async () => {
    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(404);
  });

  it('renders comments-only view when embedding is enabled', async () => {
    updateThread(db, threadId, { embedEnabled: 1 });

    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Comments');
    expect(res.text).toContain('Add a comment');
    expect(res.text).not.toContain('Blog Comments Thread');
    expect(res.text).not.toContain('Opening post body hidden in embed');
    expect(res.headers['content-security-policy']).toContain('frame-ancestors');
  });

  it('renders login prompt for anonymous users', async () => {
    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Log in to post');
    expect(res.text).toContain('Create account');
  });

  it('creates approved posts for trusted users via embed approval helper', async () => {
    const user = await createUser(db, 'trusteduser', 'trusted@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'trusted' WHERE id = ?").run(user.id);

    const post = createPost(db, {
      threadId,
      authorUserId: user.id,
      body: 'Trusted comment',
      approvalStatus: resolveEmbedPostApproval('trusted'),
    });

    expect(post.approvalStatus).toBe('approved');
  });

  it('queues new-user embed posts for moderation via approval helper', async () => {
    const user = await createUser(db, 'newuser2', 'newuser2@example.com', 'password123');

    const post = createPost(db, {
      threadId,
      authorUserId: user.id,
      body: 'Pending comment',
      approvalStatus: resolveEmbedPostApproval('new'),
    });

    expect(post.approvalStatus).toBe('new');
  });

  it('register preserves next URL for embed auth return', async () => {
    const next = `/embed/auth-return?threadId=${threadId}`;
    const res = await request(app).get(`/register?next=${encodeURIComponent(next)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`value="${next}"`);
  });

  it('login preserves next URL for embed auth return', async () => {
    const next = `/embed/auth-return?threadId=${threadId}`;
    const res = await request(app).get(`/login?next=${encodeURIComponent(next)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`value="${next}"`);
  });
});

describe('resolveEmbedPostApproval', () => {
  it('approves trusted and verified users', () => {
    expect(resolveEmbedPostApproval('trusted')).toBe('approved');
    expect(resolveEmbedPostApproval('verified')).toBe('approved');
  });

  it('queues other trust levels', () => {
    expect(resolveEmbedPostApproval('new')).toBe('new');
    expect(resolveEmbedPostApproval('unknown')).toBe('new');
  });
});
