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
import { formatDisplayDate, toIsoTimestamp } from '../utils/formatDate';
import { editButtonLabel } from '../utils/editButtonLabel';
import { withBasePath, getBasePath } from '../utils/basePath';
import * as dbModule from '../db/db';

function extractCsrfToken(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) {throw new Error('CSRF token not found');}
  return match[1];
}

describe('Admin user search', () => {
  let db: Database.Database;
  let app: express.Express;
  let adminSessionCookie: string;
  let memberId: string;

  beforeAll(async () => {
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    const admin = await createUser(db, 'searchadmin', 'searchadmin@example.com', 'password123', 'admin');
    const member = await createUser(db, 'findme', 'findme@example.com', 'password123');
    memberId = member.id;
    const adminSession = createSession(db, admin.id);
    adminSessionCookie = `ff_session=${adminSession.sessionId}`;

    app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(process.cwd(), 'src/views'));
    app.locals.formatDate = formatDisplayDate;
    app.locals.isoTimestamp = toIsoTimestamp;
    app.locals.editButtonLabel = editButtonLabel;
    app.locals.url = withBasePath;
    app.locals.basePath = getBasePath();
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(requestId);
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use('/', webRouter);
  });

  it('renders the user search page for admins', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Find Users');
    expect(res.text).toContain('Search by username or email');
  });

  it('shows matching users with profile links', async () => {
    const res = await request(app)
      .get('/admin/users?q=findme')
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('findme');
    expect(res.text).toContain(`href="/users/${memberId}"`);
  });

  it('lets admins reset a user password from the profile page', async () => {
    const agent = request.agent(app);
    const profilePage = await agent
      .get(`/admin/users/${memberId}/profile`)
      .set('Cookie', adminSessionCookie);
    const csrf = extractCsrfToken(profilePage.text);

    const res = await agent
      .post(`/admin/users/${memberId}/password`)
      .set('Cookie', adminSessionCookie)
      .type('form')
      .send({
        _csrf: csrf,
        password: 'resetpass99',
        confirmPassword: 'resetpass99',
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Password updated.');

    const { loginUser } = await import('../services/auth');
    expect(await loginUser(db, 'findme@example.com', 'password123')).toBeNull();
    expect(await loginUser(db, 'findme@example.com', 'resetpass99')).not.toBeNull();
  });
});
