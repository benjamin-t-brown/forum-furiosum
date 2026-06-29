import { Router } from 'express';
import { getDb } from '../../db/db';
import { createUser, loginUser, getUserByEmail, getUserByUsername } from '../../services/auth';
import { createSession, deleteSession } from '../../services/session';
import { setSessionCookie } from '../../middleware/session';
import { loginRateLimiter, signupRateLimiter, ephemeralIdentifyRateLimiter } from '../../middleware/rateLimiter';
import { requireAuth } from '../../middleware/requireAuth';
import { identifyEphemeralClient, isEphemeralUser, upgradeEphemeralUser } from '../../services/ephemeralUsers';
import { ok, fail } from './helpers';
import { getUsernameValidationError } from '../../utils/usernameValidation';

export const authRouter = Router();

// POST /api/v1/auth/ephemeral/identify
authRouter.post('/ephemeral/identify', ephemeralIdentifyRateLimiter, async (req, res) => {
  const { clientId, threadId } = req.body ?? {};
  if (!clientId || !threadId) {
    return void fail(res, 400, 'VALIDATION_ERROR', 'clientId and threadId are required');
  }

  const db = getDb();
  const result = await identifyEphemeralClient(db, clientId, threadId, req.ip, req.headers['user-agent']);
  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'FORBIDDEN' || result.code === 'BANNED' ? 403 : 400;
    return void fail(res, status, result.code, result.message);
  }

  setSessionCookie(res, result.session.sessionId);
  const { passwordHash: _, ...safeUser } = result.user;
  ok(res, { user: safeUser, isNew: result.isNew });
});

// POST /api/v1/auth/register
authRouter.post('/register', signupRateLimiter, async (req, res) => {
  const { username, email, password, website } = req.body;
  const caughtBot = typeof website === 'string' && website.trim().length > 0;
  const upgradingEphemeral = req.user != null && isEphemeralUser(req.user);

  if (!username || !email || !password) {return void fail(res, 400, 'VALIDATION_ERROR', 'username, email, and password are required');}
  const usernameError = getUsernameValidationError(username);
  if (usernameError) {return void fail(res, 400, 'VALIDATION_ERROR', usernameError);}
  if (password.length < 8) {return void fail(res, 400, 'VALIDATION_ERROR', 'password must be at least 8 characters');}
  if (password.length > 128) {return void fail(res, 400, 'VALIDATION_ERROR', 'password must be under 128 characters');}

  const db = getDb();

  if (getUserByEmail(db, email)) {return void fail(res, 409, 'CONFLICT', 'Email already registered');}
  if (getUserByUsername(db, username)) {return void fail(res, 409, 'CONFLICT', 'Username already taken');}

  let user;
  let sessionId = req.sessionId;
  if (upgradingEphemeral) {
    user = await upgradeEphemeralUser(db, req.user!.id, username, email, password, caughtBot ? 'unknown' : undefined);
    if (!user) {return void fail(res, 400, 'VALIDATION_ERROR', 'Could not upgrade ephemeral account');}
  } else {
    user = await createUser(db, username, email, password, 'user', caughtBot ? 'unknown' : undefined);
    const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
    setSessionCookie(res, session.sessionId);
    sessionId = session.sessionId;
  }

  const { passwordHash: _, ...safeUser } = user;
  ok(res, { user: safeUser, sessionId, upgradedFromEphemeral: upgradingEphemeral }, 201);
});

// POST /api/v1/auth/login
authRouter.post('/login', loginRateLimiter, async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {return void fail(res, 400, 'VALIDATION_ERROR', 'usernameOrEmail and password are required');}

  const db = getDb();
  const user = await loginUser(db, usernameOrEmail, password);

  if (!user) {return void fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid username/email or password');}
  if (user.trust === 'banned') {return void fail(res, 403, 'BANNED', 'Your account has been banned');}

  const session = createSession(db, user.id, req.ip, req.headers['user-agent']);
  setSessionCookie(res, session.sessionId);

  const { passwordHash: _, ...safeUser } = user;
  ok(res, { user: safeUser, sessionId: session.sessionId });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', requireAuth, (req, res) => {
  const db = getDb();
  if (req.sessionId) {deleteSession(db, req.sessionId);}
  res.clearCookie('ff_session');
  ok(res, { loggedOut: true });
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, (req, res) => {
  const { passwordHash: _, ...safeUser } = req.user!;
  ok(res, safeUser);
});
