import { Router } from 'express';
import { getDb } from '../../db/db';
import { getPostById, updatePost, deletePost } from '../../services/posts';
import { getThreadById } from '../../services/threads';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { writeAuditLog, approvePost, hidePost } from '../../services/moderation';
import { ok, fail } from './helpers';
import { getPostBodyValidationError } from '../../utils/postBodyLimits';
import { canEditPostOnThread } from '../../utils/threadLock';

export const postsRouter = Router();

// PATCH /api/v1/posts/:id
postsRouter.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return void fail(res, 404, 'NOT_FOUND', 'Post not found');}

  const user = req.user!;
  const thread = getThreadById(db, post.threadId, 'admin');
  if (!thread) {return void fail(res, 404, 'NOT_FOUND', 'Thread not found');}

  if (!canEditPostOnThread(!!thread.isLocked, user, post.authorUserId, user.id)) {
    return void fail(res, 403, 'FORBIDDEN', 'Cannot edit this post');
  }

  const { body, reason } = req.body;
  if (body !== undefined) {
    const bodyError = getPostBodyValidationError(body);
    if (bodyError) {return void fail(res, 400, 'VALIDATION_ERROR', bodyError);}
  }

  const updated = updatePost(db, (req.params.id as string), { body, lastEditedByUserId: user.id, lastEditedReason: reason });
  ok(res, updated);
});

// DELETE /api/v1/posts/:id
postsRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return void fail(res, 404, 'NOT_FOUND', 'Post not found');}

  const user = req.user!;
  const isOwner = post.authorUserId === user.id;
  const isMod = user.role === 'admin' || user.role === 'moderator';

  if (!isOwner && !isMod) {return void fail(res, 403, 'FORBIDDEN', 'Cannot delete this post');}

  deletePost(db, (req.params.id as string));
  if (isMod && !isOwner) {
    writeAuditLog(db, { actorUserId: user.id, targetType: 'post', targetId: (req.params.id as string), action: 'delete', reason: req.body.reason });
  }
  ok(res, { deleted: true });
});

// POST /api/v1/posts/:id/approve
postsRouter.post('/:id/approve', requireAuth, requireRole('admin', 'moderator'), (req, res) => {
  const db = getDb();
  const result = approvePost(db, (req.params.id as string), req.user!.id, req.body.reason);
  if (!result.success) {return void fail(res, 400, 'INVALID_TRANSITION', result.error ?? 'Approval failed');}
  ok(res, { approved: true });
});

// POST /api/v1/posts/:id/hide
postsRouter.post('/:id/hide', requireAuth, requireRole('admin', 'moderator'), (req, res) => {
  const db = getDb();
  const hide = req.body.hide !== false;
  const result = hidePost(db, (req.params.id as string), req.user!.id, hide, req.body.reason);
  if (!result.success) {return void fail(res, 404, 'NOT_FOUND', result.error ?? 'Post not found');}
  ok(res, { hidden: hide });
});
