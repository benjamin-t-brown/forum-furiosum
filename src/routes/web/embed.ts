import { Router, Request, Response } from 'express';
import { getDb } from '../../db/db';
import { getEmbedThreadById } from '../../services/threads';
import { listPosts, createPost, resolveEmbedPostApproval } from '../../services/posts';
import { renderBody } from '../../utils/renderBody';
import { embedFramePolicy } from '../../middleware/embedFramePolicy';

export const embedRouter = Router();

embedRouter.use(embedFramePolicy);

function renderEmbedThread(
  req: Request,
  res: Response,
  threadId: string,
  options: {
    page?: number;
    error?: string | null;
    body?: string;
    notice?: string | null;
  } = {}
): void {
  const db = getDb();
  const thread = getEmbedThreadById(db, threadId);
  if (!thread) {
    res.status(404).render('embed/error', {
      title: 'Not Found',
      message: 'This thread is not available for embedding.',
    });
    return;
  }

  const page = Math.max(1, options.page ?? 1);
  const posts = listPosts(db, threadId, { page, limit: 20, role: req.user?.role });
  const postsWithHtml = {
    ...posts,
    data: posts.data.map((p) => ({ ...p, bodyHtml: renderBody(p.body) })),
  };

  res.render('embed/thread', {
    title: 'Comments',
    thread,
    posts: postsWithHtml,
    page,
    threadId,
    draftKey: `embed-draft-${threadId}`,
    csrfToken: res.locals.csrfToken,
    error: options.error ?? null,
    body: options.body ?? '',
    notice: options.notice ?? null,
    authReturnUrl: `/embed/auth-return?threadId=${encodeURIComponent(threadId)}`,
  });
}

// GET /embed/auth-return
embedRouter.get('/auth-return', (req, res) => {
  const threadId = req.query.threadId as string;
  if (!threadId) {
    return res.status(400).render('embed/error', { title: 'Error', message: 'Missing thread ID.' });
  }

  const db = getDb();
  const thread = getEmbedThreadById(db, threadId);
  if (!thread) {
    return res.status(404).render('embed/error', { title: 'Not Found', message: 'Thread not found.' });
  }

  if (!req.user) {
    return res.render('embed/error', {
      title: 'Not signed in',
      message: 'Login did not complete. Close this window and try again.',
    });
  }

  res.render('embed/auth-return', {
    title: 'Completing sign in',
    threadId,
    csrfToken: res.locals.csrfToken,
    draftKey: `embed-draft-${threadId}`,
  });
});

// GET /embed/threads/:id
embedRouter.get('/threads/:id', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10) || 1);
  let notice: string | null = null;
  if (req.query.posted === 'pending') {
    notice = 'Your comment was submitted and is awaiting moderation.';
  } else if (req.query.posted === '1') {
    notice = 'Your comment was posted.';
  }
  renderEmbedThread(req, res, req.params.id as string, { page, notice });
});

// POST /embed/threads/:id/posts
embedRouter.post('/threads/:id/posts', (req, res) => {
  const threadId = req.params.id as string;
  const db = getDb();
  const thread = getEmbedThreadById(db, threadId);
  if (!thread) {
    return res.status(404).render('embed/error', { title: 'Not Found', message: 'Thread not found.' });
  }

  if (!req.user) {
    const next = `/embed/auth-return?threadId=${encodeURIComponent(threadId)}`;
    return res.redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 10000) {
    return renderEmbedThread(req, res, threadId, {
      error: 'Comment is required (max 10000 characters).',
      body: body ?? '',
    });
  }

  const approvalStatus = resolveEmbedPostApproval(req.user.trust);
  createPost(db, {
    threadId,
    authorUserId: req.user.id,
    body,
    approvalStatus,
  });

  const posted = approvalStatus === 'approved' ? '1' : 'pending';
  res.redirect(`/embed/threads/${threadId}?posted=${posted}`);
});
