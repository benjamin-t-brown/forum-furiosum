import { Router } from 'express';
import { categoriesRouter } from './categories';
import { threadsRouter } from './threads';
import { postsRouter } from './posts';
import { usersRouter } from './users';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { apiRateLimiter } from '../../middleware/rateLimiter';

export const apiRouter = Router();

apiRouter.use(apiRateLimiter);

apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/threads', threadsRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);

// 404 for unmatched API routes
apiRouter.use((_req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
});
