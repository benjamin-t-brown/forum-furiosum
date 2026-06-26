import { Router } from 'express';
import { getDb } from '../../db/db';
import { createUser, loginUser, getUserByEmail, getUserByUsername } from '../../services/auth';
import { createSession, deleteSession } from '../../services/session';
import { setSessionCookie } from '../../middleware/session';
import { loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimiter';
import { csrfProtection } from '../../middleware/csrf';

export const authWebRouter = Router();

// GET /register
authWebRouter.get('/register', (req, res) => {
  if (req.user) {return res.redirect('/');}
  res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: null });
});

// POST /register
authWebRouter.post('/register', signupRateLimiter, async (req, res) => {
  if (req.user) {return res.redirect('/');}
  const { username, email, password, honeypot } = req.body;

  if (honeypot) {return res.redirect('/');}

  const errors: string[] = [];
  if (!username || !/^[A-Za-z0-9]{3,24}$/.test(username)) {errors.push('Username must be 3-24 alphanumeric characters');}
  if (!email || !email.includes('@')) {errors.push('Valid email required');}
  if (!password || password.length < 8) {errors.push('Password must be at least 8 characters');}

  if (errors.length) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: errors.join(', ') });
  }

  const db = getDb();
  if (getUserByEmail(db, email)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Email already registered' });
  }
  if (getUserByUsername(db, username)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Username already taken' });
  }

  const user = await createUser(db, username, email, password);
  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);
  res.redirect('/');
});

// GET /login
authWebRouter.get('/login', (req, res) => {
  if (req.user) {return res.redirect('/');}
  const next = req.query.next as string || '/';
  res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: null, next });
});

// POST /login
authWebRouter.post('/login', loginRateLimiter, async (req, res) => {
  if (req.user) {return res.redirect('/');}
  const { usernameOrEmail, password, next } = req.body;
  const redirectTo = (next && next.startsWith('/') && !next.startsWith('//')) ? next : '/';

  const db = getDb();
  const user = await loginUser(db, usernameOrEmail, password);

  if (!user) {
    return res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: 'Invalid username/email or password', next: redirectTo });
  }
  if (user.trust === 'banned') {
    return res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: 'Your account has been banned', next: redirectTo });
  }

  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);
  res.redirect(redirectTo);
});

// POST /logout
authWebRouter.post('/logout', (req, res) => {
  const db = getDb();
  if (req.sessionId) {deleteSession(db, req.sessionId);}
  res.clearCookie('ff_session');
  res.redirect('/');
});
