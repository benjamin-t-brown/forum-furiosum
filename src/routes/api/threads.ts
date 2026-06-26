import { Router } from 'express';
import { getDb } from '../../db/db';
import { listThreads, getThreadById, createThread, updateThread, deleteThread } from '../../services/threads';
import { listPosts, createPost } from '../../services/posts';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { writeAuditLog, approveThread, hideThread } from '../../services/moderation';
import { ok, fail, parsePagination } from './helpers';

export const threadsRouter = Router();

// GET /api/v1/threads
threadsRouter.get('/', (req, res) => {
  const { page, limit } = parsePagination(req);
  const db = getDb();
  const result = listThreads(db, {
    categoryId: req.query.categoryId as string | undefined,
    page, limit,
    role: req.user?.role
  });
  ok(res, result);
});

// GET /api/v1/threads/:id
threadsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}
  ok(res, thread);
});

// GET /api/v1/threads/:id/posts
threadsRouter.get('/:id/posts', (req, res) => {
  const { page, limit } = parsePagination(req);
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}
  const result = listPosts(db, (req.params.id as string), { page, limit, role: req.user?.role });
  ok(res, result);
});

// POST /api/v1/threads
threadsRouter.post('/', requireAuth, (req, res) => {
  const { categoryId, title, body } = req.body;
  if (!categoryId || !title || !body) {return void fail(res, 400, 'VALIDATION_ERROR', 'categoryId, title, and body are required');}
  if (title.length < 3 || title.length > 120) {return void fail(res, 400, 'VALIDATION_ERROR', 'title must be 3-120 characters');}
  if (body.length < 1 || body.length > 10000) {return void fail(res, 400, 'VALIDATION_ERROR', 'body must be 1-10000 characters');}
  const db = getDb();
  const thread = createThread(db, { categoryId, authorUserId: req.user!.id, title, body });
  ok(res, thread, 201);
});

// POST /api/v1/threads/:id/posts
threadsRouter.post('/:id/posts', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 10000) {return void fail(res, 400, 'VALIDATION_ERROR', 'body must be 1-10000 characters');}

  const post = createPost(db, { threadId: (req.params.id as string), authorUserId: req.user!.id, body });
  ok(res, post, 201);
});

// PATCH /api/v1/threads/:id
threadsRouter.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}

  const user = req.user!;
  const isOwner = thread.authorUserId === user.id;
  const isMod = user.role === 'admin' || user.role === 'moderator';

  if (!isOwner && !isMod) {return void fail(res, 403, 'FORBIDDEN', 'Cannot edit this thread');}

  const { title, body, reason } = req.body;
  if (title !== undefined && (title.length < 3 || title.length > 120)) {return void fail(res, 400, 'VALIDATION_ERROR', 'title must be 3-120 characters');}
  if (body !== undefined && (body.length < 1 || body.length > 10000)) {return void fail(res, 400, 'VALIDATION_ERROR', 'body must be 1-10000 characters');}

  const updated = updateThread(db, (req.params.id as string), { title, body, lastEditedByUserId: user.id, lastEditedReason: reason });
  ok(res, updated);
});

// DELETE /api/v1/threads/:id
threadsRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}

  const user = req.user!;
  const isOwner = thread.authorUserId === user.id;
  const isMod = user.role === 'admin' || user.role === 'moderator';

  if (!isOwner && !isMod) {return void fail(res, 403, 'FORBIDDEN', 'Cannot delete this thread');}

  deleteThread(db, (req.params.id as string));
  if (isMod && !isOwner) {
    writeAuditLog(db, { actorUserId: user.id, targetType: 'thread', targetId: (req.params.id as string), action: 'delete', reason: req.body.reason });
  }
  ok(res, { deleted: true });
});

// POST /api/v1/threads/:id/approve
threadsRouter.post('/:id/approve', requireAuth, requireRole('admin', 'moderator'), (req, res) => {
  const db = getDb();
  const result = approveThread(db, (req.params.id as string), req.user!.id, req.body.reason);
  if (!result.success) {return void fail(res, 400, 'INVALID_TRANSITION', result.error ?? 'Approval failed');}
  ok(res, { approved: true });
});

// POST /api/v1/threads/:id/hide
threadsRouter.post('/:id/hide', requireAuth, requireRole('admin', 'moderator'), (req, res) => {
  const db = getDb();
  const hide = req.body.hide !== false;
  const result = hideThread(db, (req.params.id as string), req.user!.id, hide, req.body.reason);
  if (!result.success) {return void fail(res, 404, 'NOT_FOUND', result.error ?? 'Thread not found');}
  ok(res, { hidden: hide });
});
