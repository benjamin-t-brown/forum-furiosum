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
import { formatDisplayDate } from '../utils/formatDate';
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
    expect(res.text).toContain('Edit Profile');
    expect(res.text).toMatch(/Joined: \d{4}-\d{2}-\d{2}/);
  });
});
