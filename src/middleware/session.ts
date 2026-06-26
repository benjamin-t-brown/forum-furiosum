import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/db';
import { getSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '../services/session';
import { getUserById } from '../services/auth';


function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {return cookies;}
  cookieHeader.split(';').forEach(part => {
    const [key, ...vals] = part.trim().split('=');
    cookies[key.trim()] = decodeURIComponent(vals.join('='));
  });
  return cookies;
}

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return next();
  }

  const db = getDb();
  const session = getSession(db, sessionId);

  if (!session) {
    // Clear invalid cookie
    res.clearCookie(SESSION_COOKIE_NAME);
    return next();
  }

  const user = getUserById(db, session.userId);
  if (!user) {
    res.clearCookie(SESSION_COOKIE_NAME);
    return next();
  }

  req.user = user;
  req.sessionId = sessionId;
  next();
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  });
}
