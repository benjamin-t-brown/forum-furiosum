import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../../db/db';
import { getForumSettings } from '../../services/settings';
import { csrfProtection } from '../../middleware/csrf';
import { homeRouter } from './home';
import { authWebRouter } from './auth';
import { threadsWebRouter } from './threads';
import { postsWebRouter } from './posts';
import { usersWebRouter } from './users';
import { adminWebRouter } from './admin';
import { embedRouter } from './embed';

export const webRouter = Router();

// Set up CSRF for all web routes so logout form always has a token
webRouter.use(csrfProtection);

// Inject settings, user, and csrfToken into all web templates
webRouter.use((req: Request, res: Response, next: NextFunction) => {
  const db = getDb();
  const settings = getForumSettings(db);
  res.locals.settings = settings;
  res.locals.user = req.user ?? null;
  res.locals.forumName = settings.forumName;
  res.locals.csrfToken = req.csrfToken();
  next();
});

webRouter.use('/', homeRouter);
webRouter.use('/', authWebRouter);
webRouter.use('/embed', embedRouter);
webRouter.use('/threads', threadsWebRouter);
webRouter.use('/posts', postsWebRouter);
webRouter.use('/users', usersWebRouter);
webRouter.use('/admin', adminWebRouter);
