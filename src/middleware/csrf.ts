import csurf from 'csurf';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getCookiePath } from '../utils/basePath';

export const csrfProtection = csurf({
  cookie: { httpOnly: true, sameSite: 'lax', path: getCookiePath() },
});

// No-op middleware for routes that don't need CSRF
export const csrfMiddleware = (_req: Request, _res: Response, next: NextFunction): void => next();
