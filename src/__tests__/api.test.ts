import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { createTestDb } from './helpers/db';
import { apiRouter } from '../routes/api';
import { sessionMiddleware } from '../middleware/session';
import { requestId } from '../middleware/requestId';
import { csrfMiddleware } from '../middleware/csrf';
import { trimBody } from '../middleware/trimBody';
import { MAX_POST_BODY_LENGTH } from '../utils/postBodyLimits';
import { createUser } from '../services/auth';
import { createSession } from '../services/session';

// Override getDb to use test DB
import * as dbModule from '../db/db';
import { vi } from 'vitest';

describe('API routes (integration)', () => {
  let db: Database.Database;
  let app: express.Express;
  let userSessionCookie: string;
  let adminSessionCookie: string;
  let userId: string;
  let adminId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    db = createTestDb();

    // Mock getDb to return test DB
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    // Create test users
    const user = await createUser(db, 'apiuser', 'api@example.com', 'password123');
    userId = user.id;
    const admin = await createUser(db, 'apiadmin', 'apiadmin@example.com', 'password123', 'admin');
    adminId = admin.id;

    // Create sessions
    const userSession = createSession(db, userId);
    const adminSession = createSession(db, adminId);
    userSessionCookie = `ff_session=${userSession.sessionId}`;
    adminSessionCookie = `ff_session=${adminSession.sessionId}`;

    // Build minimal Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(trimBody);
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/api/v1', apiRouter);
  });

  describe('GET /api/v1/categories', () => {
    it('returns ok envelope', async () => {
      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/threads', () => {
    it('returns paginated envelope', async () => {
      const res = await request(app).get('/api/v1/threads');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('limit');
      expect(res.body.data).toHaveProperty('totalPages');
    });
  });

  describe('POST /api/v1/threads', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .send({ categoryId, title: 'Test', body: 'Hello' });
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates thread when authenticated', async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', userSessionCookie)
        .send({ categoryId, title: 'New Thread', body: 'Thread body content' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.title).toBe('New Thread');
    });

    it('returns 400 for invalid title', async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', userSessionCookie)
        .send({ categoryId, title: 'ab', body: 'body' }); // too short
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('trims leading and trailing whitespace from text fields', async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', userSessionCookie)
        .send({ categoryId, title: '  Trimmed Title  ', body: '  Hello world  ' });
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Trimmed Title');
      expect(res.body.data.body).toBe('Hello world');
    });

    it('rejects whitespace-only body after trimming', async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', userSessionCookie)
        .send({ categoryId, title: 'Valid title', body: '   \n  ' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /api/v1/threads/:id/posts', () => {
    let threadId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', adminSessionCookie)
        .send({ categoryId, title: 'Reply thread', body: 'Opening post' });
      threadId = res.body.data.id;
      await request(app)
        .post(`/api/v1/threads/${threadId}/approve`)
        .set('Cookie', adminSessionCookie);
    });

    it('creates a reply within the post body limit', async () => {
      const body = 'x'.repeat(MAX_POST_BODY_LENGTH);
      const res = await request(app)
        .post(`/api/v1/threads/${threadId}/posts`)
        .set('Cookie', userSessionCookie)
        .send({ body });
      expect(res.status).toBe(201);
      expect(res.body.data.body).toBe(body);
    });

    it('rejects replies over the post body limit', async () => {
      const res = await request(app)
        .post(`/api/v1/threads/${threadId}/posts`)
        .set('Cookie', userSessionCookie)
        .send({ body: 'x'.repeat(MAX_POST_BODY_LENGTH + 1) });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('locked threads', () => {
    let lockedThreadId: string;
    let userPostId: string;

    beforeAll(async () => {
      const threadRes = await request(app)
        .post('/api/v1/threads')
        .set('Cookie', adminSessionCookie)
        .send({ categoryId, title: 'Locked thread', body: 'Opening post' });
      lockedThreadId = threadRes.body.data.id;
      await request(app)
        .post(`/api/v1/threads/${lockedThreadId}/approve`)
        .set('Cookie', adminSessionCookie);

      const postRes = await request(app)
        .post(`/api/v1/threads/${lockedThreadId}/posts`)
        .set('Cookie', userSessionCookie)
        .send({ body: 'User reply before lock' });
      userPostId = postRes.body.data.id;

      await request(app)
        .post(`/api/v1/threads/${lockedThreadId}/lock`)
        .set('Cookie', adminSessionCookie)
        .send({ lock: true });
    });

    it('blocks regular users from posting to locked threads', async () => {
      const res = await request(app)
        .post(`/api/v1/threads/${lockedThreadId}/posts`)
        .set('Cookie', userSessionCookie)
        .send({ body: 'Should be blocked' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows admins to post to locked threads', async () => {
      const res = await request(app)
        .post(`/api/v1/threads/${lockedThreadId}/posts`)
        .set('Cookie', adminSessionCookie)
        .send({ body: 'Staff reply' });
      expect(res.status).toBe(201);
    });

    it('blocks owners from editing posts on locked threads', async () => {
      const ownerRes = await request(app)
        .patch(`/api/v1/posts/${userPostId}`)
        .set('Cookie', userSessionCookie)
        .send({ body: 'Edited by owner' });
      expect(ownerRes.status).toBe(403);

      const adminRes = await request(app)
        .patch(`/api/v1/posts/${userPostId}`)
        .set('Cookie', adminSessionCookie)
        .send({ body: 'Edited by admin' });
      expect(adminRes.status).toBe(200);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('returns user without passwordHash', async () => {
      const res = await request(app).get(`/api/v1/users/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('apiuser');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('returns 404 for missing user', async () => {
      const res = await request(app).get('/api/v1/users/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 when not logged in', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns current user when logged in', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', userSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('apiuser');
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates a user with new trust when website field is empty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'apinewuser',
          email: 'apinewuser@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.user.trust).toBe('new');

      const user = db.prepare('SELECT trust FROM users WHERE username = ?').get('apinewuser') as { trust: string };
      expect(user.trust).toBe('new');
    });

    it('creates a user with unknown trust when website field is filled', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'apibotuser',
          email: 'apibotuser@example.com',
          password: 'password123',
          website: 'https://spam.example',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.user.trust).toBe('unknown');

      const user = db.prepare('SELECT trust FROM users WHERE username = ?').get('apibotuser') as { trust: string };
      expect(user.trust).toBe('unknown');
    });
  });

  describe('Admin routes', () => {
    it('returns 403 for non-admin on admin routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Cookie', userSessionCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows admin to list users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Cookie', adminSessionCookie);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows admin to reset a user password', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${userId}`)
        .set('Cookie', adminSessionCookie)
        .send({ password: 'newapipass99' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const { loginUser } = await import('../services/auth');
      expect(await loginUser(db, 'api@example.com', 'password123')).toBeNull();
      expect(await loginUser(db, 'api@example.com', 'newapipass99')).not.toBeNull();
    });
  });
});
