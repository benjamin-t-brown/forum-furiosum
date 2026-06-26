import { Router } from 'express';
import { getDb } from '../../db/db';
import { getPostById, updatePost } from '../../services/posts';
import { requireAuth } from '../../middleware/requireAuth';
import { csrfProtection } from '../../middleware/csrf';

export const postsWebRouter = Router();

// GET /posts/:id/edit
postsWebRouter.get('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return res.status(404).render('error', { title: 'Not Found', message: 'Post not found', statusCode: 404 });}

  const user = req.user!;
  if (post.authorUserId !== user.id && user.role !== 'admin' && user.role !== 'moderator') {
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
  if (post.authorUserId !== user.id && user.role !== 'admin' && user.role !== 'moderator') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this post', statusCode: 403 });
  }

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 10000) {
    return res.render('posts/edit', { title: 'Edit Post', post, csrfToken: res.locals.csrfToken, error: 'Post body is required' });
  }

  updatePost(db, (req.params.id as string), { body, lastEditedByUserId: user.id });
  res.redirect(`/threads/${post.threadId}`);
});
