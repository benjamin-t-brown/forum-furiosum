import { Router } from 'express';
import { getDb } from '../../db/db';
import { createUser, loginUser, getUserByEmail, getUserByUsername } from '../../services/auth';
import { createSession, deleteSession } from '../../services/session';
import { setSessionCookie, clearSessionCookie } from '../../middleware/session';
import { loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimiter';
import { authCompleteUrl, sanitizeRedirectPath } from '../../utils/safeRedirect';
import { redirectTo, withBasePath } from '../../utils/basePath';
import { getUsernameValidationError } from '../../utils/usernameValidation';
import { isEphemeralUser, upgradeEphemeralUser } from '../../services/ephemeralUsers';

export const authWebRouter = Router();

function hasRegisteredSession(req: { user?: { isEphemeral?: 0 | 1 } | null }): boolean {
  return req.user != null && req.user.isEphemeral !== 1;
}

// GET /register
authWebRouter.get('/register', (req, res) => {
  if (hasRegisteredSession(req)) {return redirectTo(res, '/');}
  const safeNext = withBasePath(sanitizeRedirectPath((req.query.next as string) || '/'));
  res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: null, next: safeNext, clearEphemeralClient: isEphemeralUser(req.user) });
});

// POST /register
authWebRouter.post('/register', signupRateLimiter, async (req, res) => {
  if (hasRegisteredSession(req)) {return redirectTo(res, '/');}
  const { username, email, password, website, next } = req.body;
  const destination = sanitizeRedirectPath(next);
  const caughtBot = typeof website === 'string' && website.trim().length > 0;
  const upgradingEphemeral = isEphemeralUser(req.user);

  const errors: string[] = [];
  const usernameError = getUsernameValidationError(username ?? '');
  if (usernameError) {errors.push(usernameError);}
  if (!email || !email.includes('@')) {errors.push('Valid email required');}
  if (!password || password.length < 8) {errors.push('Password must be at least 8 characters');}

  if (errors.length) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: errors.join(', '), next: withBasePath(destination), clearEphemeralClient: false });
  }

  const db = getDb();
  if (getUserByEmail(db, email)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Email already registered', next: withBasePath(destination), clearEphemeralClient: false });
  }
  if (getUserByUsername(db, username)) {
    return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Username already taken', next: withBasePath(destination), clearEphemeralClient: false });
  }

  if (upgradingEphemeral) {
    const user = await upgradeEphemeralUser(db, req.user!.id, username, email, password, caughtBot ? 'unknown' : undefined);
    if (!user) {
      return res.render('register', { title: 'Register', csrfToken: res.locals.csrfToken, error: 'Could not upgrade ephemeral account', next: withBasePath(destination), clearEphemeralClient: false });
    }
    return res.render('auth/complete', {
      title: 'Registered',
      message: 'Your account has been created.',
      redirectMessage: 'Returning you to where you were…',
      next: withBasePath(destination),
      event: 'register',
      clearEphemeralClient: true,
    });
  }

  const user = await createUser(db, username, email, password, 'user', caughtBot ? 'unknown' : undefined);
  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);
  redirectTo(res, destination);
});

// GET /login
authWebRouter.get('/login', (req, res) => {
  if (hasRegisteredSession(req)) {return redirectTo(res, '/');}
  const next = withBasePath(sanitizeRedirectPath(req.query.next as string));
  res.render('login', { title: 'Login', csrfToken: res.locals.csrfToken, error: null, next });
});

// POST /login
authWebRouter.post('/login', loginRateLimiter, async (req, res) => {
  if (hasRegisteredSession(req)) {return redirectTo(res, '/');}
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
    clearEphemeralClient: false,
  });
});

// POST /logout
authWebRouter.post('/logout', (req, res) => {
  const db = getDb();
  if (req.sessionId) {deleteSession(db, req.sessionId);}
  clearSessionCookie(res);
  res.redirect(authCompleteUrl('logout', '/'));
});
