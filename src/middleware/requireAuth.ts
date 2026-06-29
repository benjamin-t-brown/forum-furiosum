import { Request, Response, NextFunction } from 'express';
import { redirectTo, withBasePath } from '../utils/basePath';

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
