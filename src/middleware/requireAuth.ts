import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    if (req.originalUrl.includes('/api/')) {
      res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    } else {
      res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    return;
  }
  next();
}
