import { Router } from 'express';
import { getDb } from '../../db/db';
import { getPostById, updatePost } from '../../services/posts';
import { getThreadById } from '../../services/threads';
import { requireAuth } from '../../middleware/requireAuth';
import { csrfProtection } from '../../middleware/csrf';
import { redirectTo } from '../../utils/basePath';
import { getPostBodyValidationError } from '../../utils/postBodyLimits';
import { canEditPostOnThread } from '../../utils/threadLock';

export const postsWebRouter = Router();

// GET /posts/:id/edit
postsWebRouter.get('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return res.status(404).render('error', { title: 'Not Found', message: 'Post not found', statusCode: 404 });}

  const user = req.user!;
  const thread = getThreadById(db, post.threadId, 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  if (!canEditPostOnThread(!!thread.isLocked, user, post.authorUserId, user.id)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this post', statusCode: 403 });
  }

  res.render('posts/edit', { title: 'Edit Post', post, csrfToken: res.locals.csrfToken, error: null });
});

// POST /posts/:id/edit
postsWebRouter.post('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return res.status(404).render('error', { title: 'Not Found', message: 'Post not found', statusCode: 404 });}

  const user = req.user!;
  const thread = getThreadById(db, post.threadId, 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  if (!canEditPostOnThread(!!thread.isLocked, user, post.authorUserId, user.id)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this post', statusCode: 403 });
  }

  const { body } = req.body;
  const bodyError = getPostBodyValidationError(body ?? '');
  if (bodyError) {
    return res.render('posts/edit', { title: 'Edit Post', post, csrfToken: res.locals.csrfToken, error: bodyError });
  }

  updatePost(db, (req.params.id as string), { body, lastEditedByUserId: user.id });
  redirectTo(res, `/threads/${post.threadId}`);
});
