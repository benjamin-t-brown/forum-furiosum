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
import { editButtonLabel } from '../utils/editButtonLabel';
import { withBasePath, getBasePath } from '../utils/basePath';
import * as dbModule from '../db/db';

function extractCsrfToken(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) {throw new Error('CSRF token not found');}
  return match[1];
}

describe('Auth web routes', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeAll(async () => {
    db = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(db);

    await createUser(db, 'member', 'member@example.com', 'password123');

    app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(process.cwd(), 'src/views'));
    app.locals.formatDate = formatDisplayDate;
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

  it('redirects successful login through the complete page', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/login?next=/threads/example');
    const csrf = extractCsrfToken(loginPage.text);

    const res = await agent
      .post('/login')
      .type('form')
      .send({
        _csrf: csrf,
        usernameOrEmail: 'member',
        password: 'password123',
        next: '/threads/example',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/complete?event=login&next=%2Fthreads%2Fexample');
  });

  it('renders the login complete page with redirect target', async () => {
    const res = await request(app).get('/auth/complete?event=login&next=%2Fthreads%2Fexample');

    expect(res.status).toBe(200);
    expect(res.text).toContain('You are now logged in.');
    expect(res.text).toContain('href="/threads/example"');
    expect(res.text).toContain('"/threads/example"');
  });

  it('redirects logout through the complete page to home', async () => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('member') as { id: string };
    const session = createSession(db, user.id);
    const cookie = `ff_session=${session.sessionId}`;

    const agent = request.agent(app);
    const homePage = await agent.get('/').set('Cookie', cookie);
    const csrf = extractCsrfToken(homePage.text);

    const res = await agent
      .post('/logout')
      .set('Cookie', cookie)
      .type('form')
      .send({ _csrf: csrf });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/complete?event=logout&next=%2F');
  });

  it('renders the logout complete page with home redirect', async () => {
    const res = await request(app).get('/auth/complete?event=logout&next=%2F');

    expect(res.status).toBe(200);
    expect(res.text).toContain('You have been logged out.');
    expect(res.text).toContain('href="/"');
  });

  it('registers a new user with new trust when website field is empty', async () => {
    const agent = request.agent(app);
    const registerPage = await agent.get('/register');
    const csrf = extractCsrfToken(registerPage.text);

    const res = await agent
      .post('/register')
      .type('form')
      .send({
        _csrf: csrf,
        username: 'newsignup',
        email: 'newsignup@example.com',
        password: 'password123',
        website: '',
        next: '/',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const user = db.prepare('SELECT trust FROM users WHERE username = ?').get('newsignup') as { trust: string };
    expect(user.trust).toBe('new');
  });

  it('registers bot submissions with unknown trust but still succeeds', async () => {
    const agent = request.agent(app);
    const registerPage = await agent.get('/register');
    const csrf = extractCsrfToken(registerPage.text);

    const res = await agent
      .post('/register')
      .type('form')
      .send({
        _csrf: csrf,
        username: 'botsignup',
        email: 'botsignup@example.com',
        password: 'password123',
        website: 'https://spam.example',
        next: '/',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const user = db.prepare('SELECT trust FROM users WHERE username = ?').get('botsignup') as { trust: string };
    expect(user.trust).toBe('unknown');
  });
});
