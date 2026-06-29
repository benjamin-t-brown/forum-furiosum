import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import pinoHttp from 'pino-http';
import { getDb } from './db/db';
import { runMigrations } from './db/migrations';
import { bootstrapAdmin } from './services/bootstrap';
import { webRouter } from './routes/web';
import { apiRouter } from './routes/api';
import { sessionMiddleware } from './middleware/session';
import { csrfMiddleware } from './middleware/csrf';
import { requestId } from './middleware/requestId';
import { trimBody } from './middleware/trimBody';
import { getForumSettings } from './services/settings';
import { formatDisplayDate } from './utils/formatDate';
import { editButtonLabel } from './utils/editButtonLabel';
import { canPostToThread } from './utils/threadLock';
import { wasContentEdited } from './utils/wasContentEdited';
import { MAX_POST_BODY_LENGTH } from './utils/postBodyLimits';
import { getBasePath, withBasePath } from './utils/basePath';
import logger from './logger';

const PORT = parseInt(process.env.PORT ?? '9827', 10);

async function main() {
  // Initialize database
  const db = getDb();
  runMigrations(db);

  // Bootstrap admin account
  await bootstrapAdmin(db);

  const app = express();
  const basePath = getBasePath();

  app.set('trust proxy', 1);

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'src/views'));
  app.locals.formatDate = formatDisplayDate;
  app.locals.editButtonLabel = editButtonLabel;
  app.locals.canPostToThread = canPostToThread;
  app.locals.wasContentEdited = wasContentEdited;
  app.locals.maxPostBodyLength = MAX_POST_BODY_LENGTH;
  app.locals.url = withBasePath;
  app.locals.basePath = basePath;

  if (basePath) {
    logger.info({ basePath }, 'Serving forum under BASE_PATH');
  }

  // Static files
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));
  app.get('/favicon.ico', (_req, res) => {
    res.sendFile(path.join(publicDir, 'favicon.png'));
  });

  // Body parsing
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(trimBody);

  // Cookie parsing (required by csurf cookie mode)
  app.use(cookieParser());

  // Request ID
  app.use(requestId);

  // Logging
  app.use(pinoHttp({ logger }));

  // Session
  app.use(sessionMiddleware);

  // CSRF (applied selectively in web routes)
  app.use(csrfMiddleware);

  // Health check (no auth required)
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/v1', apiRouter);

  // Web routes
  app.use('/', webRouter);

  function getErrorLocals(req: express.Request) {
    const db = getDb();
    let settings;
    try { settings = getForumSettings(db); } catch { settings = { forumName: 'Forum Furiosum', homeIntro: '', topBarLinks: [], featuredCategories: [], themeColorPrimary: '#a8cbe1', themeColorAccent: '#b02e0c', themeColorSurface: '#ebeae6' }; }
    return { user: req.user ?? null, settings, forumName: settings.forumName, csrfToken: '' };
  }

  // 404 handler
  app.use((req: express.Request, res: express.Response) => {
    res.status(404).render('error', { ...getErrorLocals(req), title: 'Not Found', message: 'Page not found', statusCode: 404 });
  });

  // Error handler
  app.use((err: Error & { status?: number; code?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // CSRF error
    if ((err as { code?: string }).code === 'EBADCSRFTOKEN') {
      return res.status(403).render('error', { ...getErrorLocals(req), title: 'Forbidden', message: 'Invalid CSRF token', statusCode: 403 });
    }
    logger.error({ err, reqId: (req as { id?: string }).id }, 'Unhandled error');
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).render('error', { ...getErrorLocals(req), title: 'Error', message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error', statusCode: status });
  });

  app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Forum Furiosum started');
    logger.info(`http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
