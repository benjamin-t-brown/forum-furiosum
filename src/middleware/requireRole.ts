import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../models';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      if (req.originalUrl.includes('/api/')) {
        res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      } else {
        res.redirect('/login');
      }
      return;
    }

    if (!roles.includes(req.user.role)) {
      if (req.originalUrl.includes('/api/')) {
        res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      } else {
        res.status(403).render('error', { title: 'Forbidden', message: 'You do not have permission to access this page', statusCode: 403 });
      }
      return;
    }

    next();
  };
}
