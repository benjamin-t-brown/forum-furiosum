import { Router, Request } from 'express';
import { getDb } from '../../db/db';
import { listCategories } from '../../services/categories';
import { listThreads, getThreadById, createThread, updateThread, deleteThread } from '../../services/threads';
import { listPosts, createPost, resolveReplyApproval, resolveContentApproval } from '../../services/posts';
import { writeAuditLog } from '../../services/moderation';
import { requireAuth, requireRegisteredUser } from '../../middleware/requireAuth';
import { csrfProtection } from '../../middleware/csrf';
import { renderBody } from '../../utils/renderBody';
import { buildEmbedThreadUrl, buildEmbedSnippet } from '../../utils/embedPadding';
import { parseReplyApprovalTrust, REPLY_APPROVAL_TRUST_OPTIONS, replyApprovalTrustSelectValue, type ReplyApprovalTrust } from '../../utils/replyApprovalTrust';
import { getPostBodyValidationError } from '../../utils/postBodyLimits';
import { redirectTo } from '../../utils/basePath';
import { canPostToThread } from '../../utils/threadLock';
import { canEphemeralUserPostToThread, isEphemeralUser, touchEphemeralActivity } from '../../services/ephemeralUsers';

export const threadsWebRouter = Router();

function embedThreadSnippetLocals(req: Request, thread: { id: string; embedEnabled?: 0 | 1 }) {
  if (!thread.embedEnabled) {
    return { embedUrl: null, embedSnippet: null };
  }
  const origin = `${req.protocol}://${req.get('host')}`;
  const embedUrl = buildEmbedThreadUrl(origin, thread.id);
  return { embedUrl, embedSnippet: buildEmbedSnippet(origin, embedUrl) };
}

function replyApprovalTrustFormLocals(replyApprovalTrust: ReplyApprovalTrust | null = null) {
  return {
    replyApprovalTrust: replyApprovalTrustSelectValue(replyApprovalTrust),
    replyApprovalTrustOptions: REPLY_APPROVAL_TRUST_OPTIONS,
  };
}

function getPostedNotice(posted: string | undefined): { message: string; kind: 'success' | 'info' } | null {
  if (posted === 'pending') {
    return {
      message: 'Your reply was submitted and is pending approval. It will appear in this thread once a moderator approves it.',
      kind: 'info',
    };
  }
  if (posted === '1') {
    return { message: 'Your reply was posted.', kind: 'success' };
  }
  return null;
}

// GET /threads/new
threadsWebRouter.get('/new', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const user = req.user!;
  const canModerateThread = user.role === 'admin' || user.role === 'moderator';
  const categories = listCategories(db, canModerateThread);
  res.render('threads/new', {
    title: 'New Thread',
    categories,
    csrfToken: res.locals.csrfToken,
    error: null,
    selectedCategoryId: req.query.categoryId ?? null,
    canModerateThread,
    ...replyApprovalTrustFormLocals(),
  });
});

// POST /threads/new
threadsWebRouter.post('/new', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const user = req.user!;
  const canModerateThread = user.role === 'admin' || user.role === 'moderator';
  const { categoryId, title, body } = req.body;

  const errors: string[] = [];
  if (!categoryId) {errors.push('Category is required');}
  if (!title || title.length < 3 || title.length > 120) {errors.push('Title must be 3-120 characters');}
  if (!body || body.length < 1 || body.length > 10000) {errors.push('Body is required (max 10000 chars)');}

  if (errors.length) {
    const categories = listCategories(db, canModerateThread);
    return res.render('threads/new', {
      title: 'New Thread',
      categories,
      csrfToken: res.locals.csrfToken,
      error: errors.join(', '),
      selectedCategoryId: categoryId,
      canModerateThread,
      ...replyApprovalTrustFormLocals(parseReplyApprovalTrust(req.body.replyApprovalTrust)),
    });
  }

  const approvalStatus = resolveContentApproval(user.trust);
  const thread = createThread(db, {
    categoryId,
    authorUserId: user.id,
    title,
    body,
    approvalStatus,
    ...(canModerateThread ? {
      replyApprovalTrust: parseReplyApprovalTrust(req.body.replyApprovalTrust),
      embedEnabled: req.body.embedEnabled === '1' ? 1 : 0,
    } : {}),
  });
  if (approvalStatus === 'approved') {
    return redirectTo(res,`/threads/${thread.id}`);
  }
  redirectTo(res,'/?thread=pending');
});

// GET /threads/:id
threadsWebRouter.get('/:id', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10) || 1);
  const posts = listPosts(db, (req.params.id as string), {
    page,
    limit: 20,
    role: req.user?.role,
    viewerUserId: req.user?.id,
  });

  const threadWithHtml = { ...thread, bodyHtml: renderBody(thread.body) };
  const postsWithHtml = {
    ...posts,
    data: posts.data.map((p: any) => ({ ...p, bodyHtml: renderBody(p.body) })),
  };

  const origin = `${req.protocol}://${req.get('host')}`;
  const embedUrl = thread.embedEnabled
    ? buildEmbedThreadUrl(origin, thread.id)
    : null;
  const embedSnippet = embedUrl ? buildEmbedSnippet(origin, embedUrl) : null;

  res.render('threads/show', {
    title: thread.title,
    thread: threadWithHtml,
    posts: postsWithHtml,
    page,
    csrfToken: res.locals.csrfToken,
    notice: getPostedNotice(req.query.posted as string | undefined),
    error: null,
    embedUrl,
    embedSnippet,
  });
});

// GET /threads/:id/edit
threadsWebRouter.get('/:id/edit', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const user = req.user!;
  const canModerateThread = user.role === 'admin' || user.role === 'moderator';
  if (thread.authorUserId !== user.id && !canModerateThread) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this thread', statusCode: 403 });
  }

  res.render('threads/edit', {
    title: 'Edit Thread',
    thread,
    csrfToken: res.locals.csrfToken,
    error: null,
    canModerateThread,
    ...replyApprovalTrustFormLocals(thread.replyApprovalTrust),
    ...(canModerateThread ? embedThreadSnippetLocals(req, thread) : {}),
  });
});

// POST /threads/:id/edit
threadsWebRouter.post('/:id/edit', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const user = req.user!;
  const canModerateThread = user.role === 'admin' || user.role === 'moderator';
  if (thread.authorUserId !== user.id && !canModerateThread) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this thread', statusCode: 403 });
  }

  const { title, body } = req.body;
  if (!title || title.length < 3 || title.length > 120 || !body || body.length < 1) {
    return res.render('threads/edit', {
      title: 'Edit Thread',
      thread,
      csrfToken: res.locals.csrfToken,
      error: 'Invalid input',
      canModerateThread,
      ...replyApprovalTrustFormLocals(parseReplyApprovalTrust(req.body.replyApprovalTrust)),
      ...(canModerateThread ? embedThreadSnippetLocals(req, thread) : {}),
    });
  }

  updateThread(db, (req.params.id as string), {
    title,
    body,
    lastEditedByUserId: user.id,
    ...(canModerateThread ? {
      replyApprovalTrust: parseReplyApprovalTrust(req.body.replyApprovalTrust),
      isHidden: req.body.isHidden === '1' ? 1 : 0,
      isDeleted: req.body.isDeleted === '1' ? 1 : 0,
      isLocked: req.body.isLocked === '1' ? 1 : 0,
      embedEnabled: req.body.embedEnabled === '1' ? 1 : 0,
    } : {}),
  });
  const threadId = req.params.id as string;
  if (canModerateThread && req.body.isDeleted === '1' && !thread.isDeleted) {
    writeAuditLog(db, {
      actorUserId: user.id,
      targetType: 'thread',
      targetId: threadId,
      action: 'delete',
    });
    return redirectTo(res,'/');
  }
  if (canModerateThread && (req.body.isLocked === '1') !== !!thread.isLocked) {
    writeAuditLog(db, {
      actorUserId: user.id,
      targetType: 'thread',
      targetId: threadId,
      action: req.body.isLocked === '1' ? 'lock' : 'unlock',
    });
  }
  redirectTo(res,`/threads/${threadId}`);
});

// POST /threads/:id/posts/new
threadsWebRouter.post('/:id/posts/new', requireAuth, (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), req.user?.role);
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  if (!canEphemeralUserPostToThread(thread.replyApprovalTrust, req.user)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'You cannot post replies on this thread.', statusCode: 403 });
  }

  if (!canPostToThread(!!thread.isLocked, req.user)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'This thread is locked. Only moderators can post replies.', statusCode: 403 });
  }

  const { body } = req.body;
  const bodyError = getPostBodyValidationError(body ?? '');
  if (bodyError) {
    const posts = listPosts(db, (req.params.id as string), {
      role: req.user?.role,
      viewerUserId: req.user?.id,
    });
    const threadWithHtml = { ...thread, bodyHtml: renderBody(thread.body) };
    const postsWithHtml = {
      ...posts,
      data: posts.data.map((p: any) => ({ ...p, bodyHtml: renderBody(p.body) })),
    };
    const origin = `${req.protocol}://${req.get('host')}`;
    const embedUrl = thread.embedEnabled ? buildEmbedThreadUrl(origin, thread.id) : null;
    return res.render('threads/show', {
      title: thread.title,
      thread: threadWithHtml,
      posts: postsWithHtml,
      page: 1,
      csrfToken: res.locals.csrfToken,
      error: bodyError,
      notice: null,
      embedUrl,
      embedSnippet: embedUrl ? buildEmbedSnippet(origin, embedUrl) : null,
    });
  }

  const approvalStatus = resolveReplyApproval(req.user!.trust, thread.replyApprovalTrust, {
    isEphemeral: isEphemeralUser(req.user),
  });
  const threadId = req.params.id as string;
  createPost(db, {
    threadId,
    authorUserId: req.user!.id,
    body,
    approvalStatus,
  });
  if (isEphemeralUser(req.user)) {
    touchEphemeralActivity(db, req.user!.id);
  }
  const posted = approvalStatus === 'approved' ? '1' : 'pending';
  const { totalPages } = listPosts(db, threadId, {
    role: req.user!.role,
    viewerUserId: req.user!.id,
  });
  const page = totalPages > 0 ? totalPages : 1;
  redirectTo(res, `/threads/${threadId}?page=${page}&posted=${posted}#thread-post-notice`);
});

// GET /threads/:id/posts/new (redirect to thread page for the form)
threadsWebRouter.get('/:id/posts/new', requireAuth, (req, res) => {
  redirectTo(res,`/threads/${(req.params.id as string)}`);
});
