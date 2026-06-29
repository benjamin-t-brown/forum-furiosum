import { Router, Request, Response } from 'express';
import { getDb } from '../../db/db';
import { getEmbedThreadById } from '../../services/threads';
import { listPosts, createPost, resolveReplyApproval } from '../../services/posts';
import { renderBody } from '../../utils/renderBody';
import { embedFramePolicy } from '../../middleware/embedFramePolicy';
import {
  parseEmbedPadding,
  embedPaddingStyle,
  embedPaddingQueryString,
  appendEmbedPaddingQuery,
} from '../../utils/embedPadding';
import { redirectTo, withBasePath } from '../../utils/basePath';
import { getPostBodyValidationError } from '../../utils/postBodyLimits';
import { canPostToThread } from '../../utils/threadLock';

function getEmbedPostedNotice(posted: string | undefined): { message: string; kind: 'success' | 'info' } | null {
  if (posted === 'pending') {
    return {
      message: 'Your comment was submitted and is awaiting moderation.',
      kind: 'info',
    };
  }
  if (posted === '1') {
    return { message: 'Your comment was posted.', kind: 'success' };
  }
  return null;
}

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
    notice?: { message: string; kind: 'success' | 'info' } | null;
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
  const posts = listPosts(db, threadId, {
    page,
    limit: 20,
    role: req.user?.role,
    viewerUserId: req.user?.id,
  });
  const postsWithHtml = {
    ...posts,
    data: posts.data.map((p) => ({ ...p, bodyHtml: renderBody(p.body) })),
  };

  const embedPadding = parseEmbedPadding(req.query);
  const paddingStyle = embedPaddingStyle(embedPadding);
  const paddingQuery = embedPaddingQueryString(req.query);
  const forumHomeUrl = `${req.protocol}://${req.get('host')}${withBasePath('/')}`;

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
    authReturnUrl: withBasePath(`/embed/auth-return?threadId=${encodeURIComponent(threadId)}`),
    paddingStyle,
    paddingQuery,
    forumHomeUrl,
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
  const notice = getEmbedPostedNotice(req.query.posted as string | undefined);
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
    const next = withBasePath(`/embed/auth-return?threadId=${encodeURIComponent(threadId)}`);
    return redirectTo(res, `/login?next=${encodeURIComponent(next)}`);
  }

  if (!canPostToThread(!!thread.isLocked, req.user)) {
    return renderEmbedThread(req, res, threadId, {
      error: 'This thread is locked. Only moderators can post comments.',
      body: req.body.body ?? '',
    });
  }

  const { body } = req.body;
  const bodyError = getPostBodyValidationError(body ?? '');
  if (bodyError) {
    return renderEmbedThread(req, res, threadId, {
      error: bodyError,
      body: body ?? '',
    });
  }

  const approvalStatus = resolveReplyApproval(req.user.trust, thread.replyApprovalTrust);
  createPost(db, {
    threadId,
    authorUserId: req.user.id,
    body,
    approvalStatus,
  });

  const posted = approvalStatus === 'approved' ? '1' : 'pending';
  redirectTo(res, appendEmbedPaddingQuery(`/embed/threads/${threadId}?posted=${posted}`, req.query));
});
