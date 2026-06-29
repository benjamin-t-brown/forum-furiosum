import { Router } from 'express';
import { getDb } from '../../db/db';
import { createUser, loginUser, getUserByEmail, getUserByUsername } from '../../services/auth';
import { createSession, deleteSession } from '../../services/session';
import { setSessionCookie, clearSessionCookie } from '../../middleware/session';
import { loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimiter';
import { csrfProtection } from '../../middleware/csrf';
import { authCompleteUrl, sanitizeRedirectPath } from '../../utils/safeRedirect';
import { redirectTo, withBasePath } from '../../utils/basePath';

export const authWebRouter = Router();

// GET /register
authWebRouter.get('/register', (req, res) => {
  if (req.user) {return redirectTo(res, '/');}
  const safeNext = withBasePath(sanitizeRedirectPath((req.query.next as string) || '/'));
  res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: null, next: safeNext });
});

// POST /register
authWebRouter.post('/register', signupRateLimiter, async (req, res) => {
  if (req.user) {return redirectTo(res, '/');}
  const { username, email, password, website, next } = req.body;
  const destination = sanitizeRedirectPath(next);
  const caughtBot = typeof website === 'string' && website.trim().length > 0;

  const errors: string[] = [];
  if (!username || !/^[A-Za-z0-9]{3,24}$/.test(username)) {errors.push('Username must be 3-24 alphanumeric characters');}
  if (!email || !email.includes('@')) {errors.push('Valid email required');}
  if (!password || password.length < 8) {errors.push('Password must be at least 8 characters');}

  if (errors.length) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: errors.join(', '), next: withBasePath(destination) });
  }

  const db = getDb();
  if (getUserByEmail(db, email)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Email already registered', next: withBasePath(destination) });
  }
  if (getUserByUsername(db, username)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Username already taken', next: withBasePath(destination) });
  }

  const user = await createUser(db, username, email, password, 'user', caughtBot ? 'unknown' : undefined);
  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);
  redirectTo(res, destination);
});

// GET /login
authWebRouter.get('/login', (req, res) => {
  if (req.user) {return redirectTo(res, '/');}
  const next = withBasePath(sanitizeRedirectPath(req.query.next as string));
  res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: null, next });
});

// POST /login
authWebRouter.post('/login', loginRateLimiter, async (req, res) => {
  if (req.user) {return redirectTo(res, '/');}
  const { usernameOrEmail, password, next } = req.body;
  const destination = sanitizeRedirectPath(next);

  const db = getDb();
  const user = await loginUser(db, usernameOrEmail, password);

  if (!user) {
    return res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: 'Invalid username/email or password', next: withBasePath(destination) });
  }
  if (user.trust === 'banned') {
    return res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: 'Your account has been banned', next: withBasePath(destination) });
  }

  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);
  res.redirect(authCompleteUrl('login', destination));
});

// GET /auth/complete
authWebRouter.get('/auth/complete', (req, res) => {
  const event = req.query.event;
  if (event !== 'login' && event !== 'logout') {
    return redirectTo(res, '/');
  }

  const next = withBasePath(sanitizeRedirectPath(req.query.next as string));
  const message = event === 'login' ? 'You are now logged in.' : 'You have been logged out.';
  const redirectMessage = event === 'login'
    ? 'Returning you to where you were…'
    : 'Returning you to the home page…';

  res.render('auth/complete', {
    title: event === 'login' ? 'Logged In' : 'Logged Out',
    message,
    redirectMessage,
    next,
    event,
  });
});

// POST /logout
authWebRouter.post('/logout', (req, res) => {
  const db = getDb();
  if (req.sessionId) {deleteSession(db, req.sessionId);}
  clearSessionCookie(res);
  res.redirect(authCompleteUrl('logout', '/'));
});
