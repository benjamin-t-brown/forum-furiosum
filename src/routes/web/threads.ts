import { Router } from 'express';
import { getDb } from '../../db/db';
import { listCategories } from '../../services/categories';
import { listThreads, getThreadById, createThread, updateThread, deleteThread } from '../../services/threads';
import { listPosts, createPost } from '../../services/posts';
import { requireAuth } from '../../middleware/requireAuth';
import { csrfProtection } from '../../middleware/csrf';
import { renderBody } from '../../utils/renderBody';

export const threadsWebRouter = Router();

// GET /threads/new
threadsWebRouter.get('/new', requireAuth, (req, res) => {
  const db = getDb();
  const categories = listCategories(db);
  res.render('threads/new', {
    title: 'New Thread',
    categories,
    csrfToken: res.locals.csrfToken,
    error: null,
    selectedCategoryId: req.query.categoryId ?? null,
  });
});

// POST /threads/new
threadsWebRouter.post('/new', requireAuth, (req, res) => {
  const db = getDb();
  const { categoryId, title, body } = req.body;

  const errors: string[] = [];
  if (!categoryId) {errors.push('Category is required');}
  if (!title || title.length < 3 || title.length > 120) {errors.push('Title must be 3-120 characters');}
  if (!body || body.length < 1 || body.length > 10000) {errors.push('Body is required (max 10000 chars)');}

  if (errors.length) {
    const categories = listCategories(db);
    return res.render('threads/new', {
      title: 'New Thread',
      categories,
      csrfToken: res.locals.csrfToken,
      error: errors.join(', '),
      selectedCategoryId: categoryId,
    });
  }

  const thread = createThread(db, { categoryId, authorUserId: req.user!.id, title, body });
  res.redirect(`/threads/${thread.id}`);
});

// GET /threads/:id
threadsWebRouter.get('/:id', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10) || 1);
  const posts = listPosts(db, (req.params.id as string), { page, limit: 20, role: req.user?.role });

  const threadWithHtml = { ...thread, bodyHtml: renderBody(thread.body) };
  const postsWithHtml = {
    ...posts,
    data: posts.data.map((p: any) => ({ ...p, bodyHtml: renderBody(p.body) })),
  };

  res.render('threads/show', {
    title: thread.title,
    thread: threadWithHtml,
    posts: postsWithHtml,
    page,
    csrfToken: res.locals.csrfToken,
    canEdit: req.user && (req.user.id === thread.authorUserId || req.user.role === 'admin' || req.user.role === 'moderator'),
  });
});

// GET /threads/:id/edit
threadsWebRouter.get('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const user = req.user!;
  if (thread.authorUserId !== user.id && user.role !== 'admin' && user.role !== 'moderator') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this thread', statusCode: 403 });
  }

  res.render('threads/edit', { title: 'Edit Thread', thread, csrfToken: res.locals.csrfToken, error: null });
});

// POST /threads/:id/edit
threadsWebRouter.post('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const user = req.user!;
  if (thread.authorUserId !== user.id && user.role !== 'admin' && user.role !== 'moderator') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this thread', statusCode: 403 });
  }

  const { title, body } = req.body;
  if (!title || title.length < 3 || title.length > 120 || !body || body.length < 1) {
    return res.render('threads/edit', { title: 'Edit Thread', thread, csrfToken: res.locals.csrfToken, error: 'Invalid input' });
  }

  updateThread(db, (req.params.id as string), { title, body, lastEditedByUserId: user.id });
  res.redirect(`/threads/${(req.params.id as string)}`);
});

// POST /threads/:id/posts/new
threadsWebRouter.post('/:id/posts/new', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 10000) {
    const posts = listPosts(db, (req.params.id as string), { role: req.user?.role });
    const threadWithHtml = { ...thread, bodyHtml: renderBody(thread.body) };
    const postsWithHtml = {
      ...posts,
      data: posts.data.map((p: any) => ({ ...p, bodyHtml: renderBody(p.body) })),
    };
    return res.render('threads/show', {
      title: thread.title,
      thread: threadWithHtml,
      posts: postsWithHtml,
      page: 1,
      csrfToken: res.locals.csrfToken,
      error: 'Reply body is required',
      canEdit: true,
    });
  }

  createPost(db, { threadId: (req.params.id as string), authorUserId: req.user!.id, body });
  res.redirect(`/threads/${(req.params.id as string)}`);
});

// GET /threads/:id/posts/new (redirect to thread page for the form)
threadsWebRouter.get('/:id/posts/new', requireAuth, (req, res) => {
  res.redirect(`/threads/${(req.params.id as string)}`);
});
