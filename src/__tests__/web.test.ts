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
import { createSession } from '../services/session';
import { createThread, updateThread } from '../services/threads';
import { formatDisplayDate, toIsoTimestamp } from '../utils/formatDate';
import { editButtonLabel } from '../utils/editButtonLabel';
import { canPostToThread } from '../utils/threadLock';
import { withBasePath, getBasePath } from '../utils/basePath';
import * as dbModule from '../db/db';

describe('Web routes (integration)', () => {
  let db: Database.Database;
  let app: express.Express;
  let adminId: string;
  let adminSessionCookie: string;

  beforeAll(async () => {
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    const admin = await createUser(db, 'admin', 'admin@example.com', 'password123', 'admin');
    adminId = admin.id;
    const adminSession = createSession(db, adminId);
    adminSessionCookie = `ff_session=${adminSession.sessionId}`;

    app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(process.cwd(), 'src/views'));
    app.locals.formatDate = formatDisplayDate;
    app.locals.isoTimestamp = toIsoTimestamp;
    app.locals.editButtonLabel = editButtonLabel;
    app.locals.canPostToThread = canPostToThread;
    app.locals.url = withBasePath;
    app.locals.basePath = getBasePath();
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/', webRouter);
  });

  it('GET /users/:id renders the profile page', async () => {
    const res = await request(app)
      .get(`/users/${adminId}`)
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('admin');
    expect(res.text).toMatch(/Joined: <time datetime="[^"]+" class="local-time" data-mode="date">/);
  });

  it('shows account status to admins on profile pages', async () => {
    const member = await createUser(db, 'trustedmember', 'trustedmember@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'trusted' WHERE id = ?").run(member.id);

    const res = await request(app)
      .get(`/users/${member.id}`)
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Status:');
    expect(res.text).toContain('badge-status');
    expect(res.text).toContain('trusted');
  });

  it('shows verified badge on admin profile', async () => {
    const res = await request(app)
      .get(`/users/${adminId}`)
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('badge-verified');
    expect(res.text).not.toContain('profile-status');
  });

  it('links home categories to the full category page', async () => {
    const categoryId = '00000000-0000-0000-0000-000000000001';
    for (let i = 1; i <= 12; i++) {
      const thread = createThread(db, {
        categoryId,
        authorUserId: adminId,
        title: `Home pagination thread ${String(i).padStart(2, '0')}`,
        body: 'body',
      });
      updateThread(db, thread.id, { approvalStatus: 'approved' });
      db.prepare("UPDATE threads SET updatedAt = datetime('now', ?) WHERE id = ?")
        .run(`-${12 - i} minutes`, thread.id);
    }

    const homePage = await request(app).get('/');
    expect(homePage.status).toBe(200);
    expect(homePage.text).toContain('Home pagination thread 12');
    expect(homePage.text).not.toContain('Home pagination thread 01');
    expect(homePage.text).toContain('See all');
    expect(homePage.text).toContain('href="/categories/general"');
    expect(homePage.text).toContain('>General Discussion</a>');
  });

  it('paginates threads on the category page', async () => {
    const categoryId = '00000000-0000-0000-0000-000000000001';
    for (let i = 1; i <= 25; i++) {
      const thread = createThread(db, {
        categoryId,
        authorUserId: adminId,
        title: `Category page thread ${String(i).padStart(2, '0')}`,
        body: 'body',
      });
      updateThread(db, thread.id, { approvalStatus: 'approved' });
      db.prepare("UPDATE threads SET updatedAt = datetime('now', ?) WHERE id = ?")
        .run(`-${25 - i} minutes`, thread.id);
    }

    const page1 = await request(app).get('/categories/general');
    expect(page1.status).toBe(200);
    expect(page1.text).toContain('General Discussion');
    expect(page1.text).toContain('Category page thread 25');
    expect(page1.text).not.toContain('Category page thread 05');
    expect(page1.text).toContain('Page 1 of 2');
    expect(page1.text).toContain('href="/categories/general?page=2"');

    const page2 = await request(app).get('/categories/general?page=2');
    expect(page2.status).toBe(200);
    expect(page2.text).toContain('Category page thread 05');
    expect(page2.text).not.toContain('Category page thread 25');
    expect(page2.text).toContain('Page 2 of 2');
    expect(page2.text).toContain('href="/categories/general"');
  });

  it('hides account status from non-staff on profile pages', async () => {
    const regularUser = await createUser(db, 'member', 'member@example.com', 'password123');
    const session = createSession(db, regularUser.id);
    const memberCookie = `ff_session=${session.sessionId}`;

    const res = await request(app)
      .get(`/users/${adminId}`)
      .set('Cookie', memberCookie);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('profile-status');
    expect(res.text).not.toMatch(/Status:\s*<span class="badge badge-status">/);
  });

  it('shows verified badge on profile for all viewers', async () => {
    const verified = await createUser(db, 'verifieduser', 'verified@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'verified' WHERE id = ?").run(verified.id);

    const res = await request(app).get(`/users/${verified.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('badge-verified');
    expect(res.text).toContain('Verified');
    expect(res.text).not.toContain('profile-status');
  });

  it('shows banned badge on profile for all viewers', async () => {
    const banned = await createUser(db, 'banneduser', 'banned@example.com', 'password123');
    db.prepare("UPDATE users SET trust = 'banned' WHERE id = ?").run(banned.id);

    const res = await request(app).get(`/users/${banned.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('badge-banned');
    expect(res.text).toContain('Banned');
    expect(res.text).not.toContain('profile-status');
  });

  it('hides reply form on locked threads for regular users', async () => {
    const member = await createUser(db, 'lockmember', 'lockmember@example.com', 'password123');
    const memberSession = createSession(db, member.id);
    const memberCookie = `ff_session=${memberSession.sessionId}`;
    const categoryId = '00000000-0000-0000-0000-000000000001';

    const thread = createThread(db, {
      categoryId,
      authorUserId: adminId,
      title: 'Locked discussion',
      body: 'Thread body',
    });
    updateThread(db, thread.id, { approvalStatus: 'approved', isLocked: 1 });

    const res = await request(app)
      .get(`/threads/${thread.id}`)
      .set('Cookie', memberCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('badge-locked');
    expect(res.text).toContain('This thread is locked');
    expect(res.text).not.toContain('Post a Reply');
  });
});
