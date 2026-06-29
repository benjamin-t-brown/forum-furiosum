import { Request, Response, NextFunction } from 'express';
import { redirectTo, withBasePath } from '../utils/basePath';
import { isEphemeralUser } from '../services/ephemeralUsers';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    if (req.originalUrl.includes('/api/')) {
      res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    } else {
      const returnTo = withBasePath(req.originalUrl);
      redirectTo(res, `/login?next=${encodeURIComponent(returnTo)}`);
    }
    return;
  }
  next();
}

export function requireRegisteredUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    if (req.originalUrl.includes('/api/')) {
      res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    } else {
      const returnTo = withBasePath(req.originalUrl);
      redirectTo(res, `/login?next=${encodeURIComponent(returnTo)}`);
    }
    return;
  }
  if (isEphemeralUser(req.user)) {
    if (req.originalUrl.includes('/api/')) {
      res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Registered account required' } });
    } else {
      redirectTo(res, '/register');
    }
    return;
  }
  next();
}
