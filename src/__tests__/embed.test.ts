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
import { createPost, resolveReplyApproval } from '../services/posts';
import { formatDisplayDate } from '../utils/formatDate';
import { editButtonLabel } from '../utils/editButtonLabel';
import { canPostToThread } from '../utils/threadLock';
import { wasContentEdited } from '../utils/wasContentEdited';
import { MAX_POST_BODY_LENGTH } from '../utils/postBodyLimits';
import { withBasePath, getBasePath } from '../utils/basePath';
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
    app.locals.editButtonLabel = editButtonLabel;
    app.locals.canPostToThread = canPostToThread;
    app.locals.wasContentEdited = wasContentEdited;
    app.locals.maxPostBodyLength = MAX_POST_BODY_LENGTH;
    app.locals.url = withBasePath;
    app.locals.basePath = getBasePath();
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
    expect(res.text).toContain('/css/main.css');
    expect(res.text).toContain('Comments');
    expect(res.text).toContain('powered by');
    expect(res.text).toContain('forum-furiosum');
    expect(res.text).toContain('Add a comment');
    expect(res.text).not.toContain('Blog Comments Thread');
    expect(res.text).not.toContain('Opening post body hidden in embed');
    expect(res.headers['content-security-policy']).toContain('frame-ancestors');
  });

  it('shows embed snippet on thread page when embedding is enabled', async () => {
    updateThread(db, threadId, { approvalStatus: 'approved' });

    const res = await request(app).get(`/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Embed this thread');
    expect(res.text).toContain(`/embed/threads/${threadId}?padding=16`);
    expect(res.text).toContain('forum-furiosum-embed');
    expect(res.text).toContain('embed-host.js');
    expect(res.text).not.toContain('height=&quot;480&quot;');
  });

  it('renders login prompt for anonymous users on non-ephemeral threads', async () => {
    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Log in to post');
    expect(res.text).toContain('Create account');
  });

  it('omits login button on ephemeral threads but keeps create account', async () => {
    updateThread(db, threadId, { replyApprovalTrust: 'ephemeral' });

    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Log in to post');
    expect(res.text).toContain('Create account');
    expect(res.text).toContain('Post comment');
  });

  it('applies configurable padding from the URL', async () => {
    const res = await request(app).get(`/embed/threads/${threadId}?padding=12`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('style="padding:12px 12px 12px 12px"');
  });

  it('preserves padding in pagination links', async () => {
    const user = await createUser(db, 'pager', 'pager@example.com', 'password123');
    for (let i = 0; i < 21; i++) {
      createPost(db, {
        threadId,
        authorUserId: user.id,
        body: `Comment ${i}`,
        approvalStatus: 'approved',
      });
    }

    const res = await request(app).get(`/embed/threads/${threadId}?padding=8&page=2`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('?page=1&amp;padding=8');
  });

  it('renders author names as plain text without profile links', async () => {
    const res = await request(app).get(`/embed/threads/${threadId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('pager');
    expect(res.text).not.toMatch(/href="\/users\/[^"]+"/);
  });

  it('shows verified badge beneath author names', async () => {
    const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('embedadmin') as { id: string };
    const user = await createUser(db, 'verifiedembed', 'verifiedembed@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'verified' WHERE id = ?").run(user.id);
    const badgeThread = createThread(db, {
      categoryId,
      authorUserId: admin.id,
      title: 'Verified badge thread',
      body: 'Opening post',
    });
    updateThread(db, badgeThread.id, { embedEnabled: 1, approvalStatus: 'approved' });
    createPost(db, {
      threadId: badgeThread.id,
      authorUserId: user.id,
      body: 'Verified comment',
      approvalStatus: 'approved',
    });

    const res = await request(app).get(`/embed/threads/${badgeThread.id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('badge-verified');
    expect(res.text).toContain('verifiedembed');
    expect(res.text).toContain('Verified');
  });

  it('creates approved posts for trusted users via embed approval helper', async () => {
    const user = await createUser(db, 'trusteduser', 'trusted@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'trusted' WHERE id = ?").run(user.id);

    const post = createPost(db, {
      threadId,
      authorUserId: user.id,
      body: 'Trusted comment',
      approvalStatus: resolveReplyApproval('trusted'),
    });

    expect(post.approvalStatus).toBe('approved');
  });

  it('queues new-user embed posts for moderation via approval helper', async () => {
    const user = await createUser(db, 'newuser2', 'newuser2@example.com', 'password123');

    const post = createPost(db, {
      threadId,
      authorUserId: user.id,
      body: 'Pending comment',
      approvalStatus: resolveReplyApproval('new'),
    });

    expect(post.approvalStatus).toBe('new');
  });

  it('auto-approves embed posts when thread reply threshold is new', async () => {
    updateThread(db, threadId, { replyApprovalTrust: 'new' });
    const user = await createUser(db, 'newuser3', 'newuser3@example.com', 'password123');

    const post = createPost(db, {
      threadId,
      authorUserId: user.id,
      body: 'Instant comment',
      approvalStatus: resolveReplyApproval('new', 'new'),
    });

    expect(post.approvalStatus).toBe('approved');
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

describe('resolveReplyApproval', () => {
  it('approves trusted and verified users', () => {
    expect(resolveReplyApproval('trusted')).toBe('approved');
    expect(resolveReplyApproval('verified')).toBe('approved');
  });

  it('queues other trust levels', () => {
    expect(resolveReplyApproval('new')).toBe('new');
    expect(resolveReplyApproval('unknown')).toBe('new');
  });
});
