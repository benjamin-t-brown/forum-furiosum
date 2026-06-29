import { Router, Request } from 'express';
import { getDb } from '../../db/db';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { getThreadById, updateThread, isValidStatusTransition } from '../../services/threads';
import { getPostById, updatePost } from '../../services/posts';
import { getUserByIdForAdmin, listUsers, updateUser, deleteAccount, adminSetUsername, adminSetPassword, searchUsers } from '../../services/users';
import { listCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from '../../services/categories';
import { writeAuditLog, getAuditLog, getPendingApprovals } from '../../services/moderation';
import { getForumSettings, updateForumSettings } from '../../services/settings';
import { listPendingUsernameChangeRequests, approveUsernameChangeRequest, rejectUsernameChangeRequest, getPendingUsernameChangeForUser, rejectPendingUsernameRequestsForUser } from '../../services/usernameChanges';
import { AUTHOR_IS_DELETED_SQL, AUTHOR_TRUST_SQL, AUTHOR_USERNAME_SQL } from '../../utils/authorDisplay';
import { buildEmbedThreadUrl, buildEmbedSnippet } from '../../utils/embedPadding';
import { parseReplyApprovalTrust, REPLY_APPROVAL_TRUST_OPTIONS, replyApprovalTrustSelectValue, type ReplyApprovalTrust } from '../../utils/replyApprovalTrust';
import { redirectTo } from '../../utils/basePath';
import { getPostBodyValidationError } from '../../utils/postBodyLimits';

function embedThreadSnippetLocals(req: Request, thread: { id: string }) {
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

export const adminWebRouter = Router();

// All admin routes require auth + mod or admin role
adminWebRouter.use(requireAuth, requireRole('admin', 'moderator'));

// GET /admin — dashboard
adminWebRouter.get('/', (req, res) => {
  const db = getDb();
  const pending = getPendingApprovals(db);
  const recentLog = getAuditLog(db, { limit: 10 });

  // Count pending threads needing approval
  const pendingThreads = db.prepare(`
    SELECT t.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, c.name as categoryName
    FROM threads t
    JOIN users u ON t.authorUserId = u.id
    JOIN categories c ON t.categoryId = c.id
    WHERE t.approvalStatus = 'new' AND t.isDeleted = 0
    ORDER BY t.createdAt DESC LIMIT 10
  `).all();

  const pendingPosts = db.prepare(`
    SELECT p.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, th.title as threadTitle
    FROM posts p
    JOIN users u ON p.authorUserId = u.id
    JOIN threads th ON p.threadId = th.id
    WHERE p.approvalStatus = 'new' AND p.isDeleted = 0
    ORDER BY p.createdAt DESC LIMIT 10
  `).all();

  const pendingUsernameChanges = listPendingUsernameChangeRequests(db);

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    pending,
    recentLog: recentLog.data,
    pendingThreads,
    pendingPosts,
    pendingUsernameChanges,
  });
});

// GET /admin/users — search
adminWebRouter.get('/users', (req, res) => {
  const db = getDb();
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const users = query ? searchUsers(db, query, { includeDeleted: true }) : [];

  res.render('admin/users', {
    title: 'Find Users',
    query,
    users,
  });
});

// GET /admin/threads/:id/edit
adminWebRouter.get('/threads/:id/edit', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const categories = listCategories(db, true);
  res.render('admin/thread-edit', {
    title: 'Edit Thread (Admin)',
    thread,
    categories,
    ...embedThreadSnippetLocals(req, thread),
    error: null,
    ...replyApprovalTrustFormLocals(thread.replyApprovalTrust),
  });
});

// POST /admin/threads/:id/edit
adminWebRouter.post('/threads/:id/edit', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const { title, body, categoryId, approvalStatus, isHidden, isDeleted, isLocked, embedEnabled, reason } = req.body;
  const replyApprovalTrust = parseReplyApprovalTrust(req.body.replyApprovalTrust);

  // Validate status transition if changing
  if (approvalStatus && approvalStatus !== thread.approvalStatus) {
    if (!isValidStatusTransition(thread.approvalStatus, approvalStatus)) {
      const categories = listCategories(db, true);
      return res.render('admin/thread-edit', {
        title: 'Edit Thread (Admin)',
        thread,
        categories,
        ...embedThreadSnippetLocals(req, thread),
        error: `Invalid status transition: ${thread.approvalStatus} → ${approvalStatus}`,
        ...replyApprovalTrustFormLocals(parseReplyApprovalTrust(req.body.replyApprovalTrust)),
      });
    }
  }

  // Validate target category exists if provided
  if (categoryId && categoryId !== thread.categoryId) {
    const targetCat = getCategoryById(db, categoryId);
    if (!targetCat) {
      const categories = listCategories(db, true);
      return res.render('admin/thread-edit', {
        title: 'Edit Thread (Admin)',
        thread,
        categories,
        ...embedThreadSnippetLocals(req, thread),
        error: 'Target category not found',
        ...replyApprovalTrustFormLocals(parseReplyApprovalTrust(req.body.replyApprovalTrust)),
      });
    }
  }

  updateThread(db, (req.params.id as string), {
    title: title || undefined,
    body: body || undefined,
    categoryId: categoryId || undefined,
    approvalStatus: approvalStatus || undefined,
    isHidden: isHidden === '1' ? 1 : 0,
    isDeleted: isDeleted === '1' ? 1 : 0,
    isLocked: isLocked === '1' ? 1 : 0,
    embedEnabled: embedEnabled === '1' ? 1 : 0,
    replyApprovalTrust,
    lastEditedByUserId: req.user!.id,
    lastEditedReason: reason || undefined,
  });

  if (isDeleted === '1' && !thread.isDeleted) {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'thread',
      targetId: (req.params.id as string),
      action: 'delete',
      reason: reason || undefined,
    });
  } else if ((isLocked === '1') !== !!thread.isLocked) {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'thread',
      targetId: (req.params.id as string),
      action: isLocked === '1' ? 'lock' : 'unlock',
      reason: reason || undefined,
    });
  } else {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'thread',
      targetId: (req.params.id as string),
      action: 'admin_edit',
      reason: reason || undefined,
    });
  }

  redirectTo(res,'/admin');
});

// GET /admin/posts/:id/edit
adminWebRouter.get('/posts/:id/edit', (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return res.status(404).render('error', { title: 'Not Found', message: 'Post not found', statusCode: 404 });}

  res.render('admin/post-edit', {
    title: 'Edit Post (Admin)',
    post,
    error: null,
  });
});

// POST /admin/posts/:id/edit
adminWebRouter.post('/posts/:id/edit', (req, res) => {
  const db = getDb();
  const post = getPostById(db, (req.params.id as string), 'admin');
  if (!post) {return res.status(404).render('error', { title: 'Not Found', message: 'Post not found', statusCode: 404 });}

  const { body, approvalStatus, isHidden, isDeleted, reason } = req.body;

  if (body !== undefined && body !== '') {
    const bodyError = getPostBodyValidationError(body);
    if (bodyError) {
      return res.render('admin/post-edit', {
        title: 'Edit Post (Admin)',
        post,
        error: bodyError,
      });
    }
  }

  if (approvalStatus && approvalStatus !== post.approvalStatus) {
    if (!isValidStatusTransition(post.approvalStatus, approvalStatus)) {
      return res.render('admin/post-edit', {
        title: 'Edit Post (Admin)',
        post,
        error: `Invalid status transition: ${post.approvalStatus} → ${approvalStatus}`,
      });
    }
  }

  updatePost(db, (req.params.id as string), {
    body: body || undefined,
    approvalStatus: approvalStatus || undefined,
    isHidden: isHidden === '1' ? 1 : 0,
    isDeleted: isDeleted === '1' ? 1 : 0,
    lastEditedByUserId: req.user!.id,
    lastEditedReason: reason || undefined,
  });

  if (isDeleted === '1' && !post.isDeleted) {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'post',
      targetId: (req.params.id as string),
      action: 'delete',
      reason: reason || undefined,
    });
  } else {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'post',
      targetId: (req.params.id as string),
      action: 'admin_edit',
      reason: reason || undefined,
    });
  }

  redirectTo(res,'/admin');
});

// GET /admin/users/:id/profile
adminWebRouter.get('/users/:id/profile', requireRole('admin'), (req, res) => {
  const db = getDb();
  const profile = getUserByIdForAdmin(db, (req.params.id as string));
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  const pendingUsernameRequest = getPendingUsernameChangeForUser(db, profile.id);

  res.render('admin/user-profile', {
    title: 'Edit User Profile',
    profile,
    pendingUsernameRequest,
    currentAdminId: req.user!.id,
    error: null,
    success: null,
  });
});

// POST /admin/users/:id/profile
adminWebRouter.post('/users/:id/profile', requireRole('admin'), (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;
  const profile = getUserByIdForAdmin(db, userId);
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  const { username, reason } = req.body;
  const result = adminSetUsername(db, userId, username ?? '', req.user!.id, reason || undefined);

  if (result.success && username && username.trim().toLowerCase() !== profile.username.toLowerCase()) {
    rejectPendingUsernameRequestsForUser(db, userId, req.user!.id, 'Superseded by admin username change');
  }

  const pendingUsernameRequest = getPendingUsernameChangeForUser(db, userId);
  res.render('admin/user-profile', {
    title: 'Edit User Profile',
    profile: getUserByIdForAdmin(db, userId)!,
    pendingUsernameRequest,
    currentAdminId: req.user!.id,
    error: result.success ? null : result.error,
    success: result.success ? 'Username updated.' : null,
  });
});

// POST /admin/users/:id/password
adminWebRouter.post('/users/:id/password', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;
  const profile = getUserByIdForAdmin(db, userId);
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  const { password, confirmPassword, reason } = req.body;
  const pendingUsernameRequest = getPendingUsernameChangeForUser(db, userId);

  let error: string | null = null;
  let success: string | null = null;

  if ((password ?? '') !== (confirmPassword ?? '')) {
    error = 'Passwords do not match';
  } else {
    const result = await adminSetPassword(db, userId, password ?? '', req.user!.id, reason || undefined);
    if (result.success) {
      success = 'Password updated.';
    } else {
      error = result.error ?? 'Failed to update password';
    }
  }

  res.render('admin/user-profile', {
    title: 'Edit User Profile',
    profile: getUserByIdForAdmin(db, userId)!,
    pendingUsernameRequest,
    currentAdminId: req.user!.id,
    error,
    success,
  });
});

// POST /admin/users/:id/delete
adminWebRouter.post('/users/:id/delete', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;

  if (userId === req.user!.id) {
    const profile = getUserByIdForAdmin(db, userId)!;
    return res.render('admin/user-profile', {
      title: 'Edit User Profile',
      profile,
      pendingUsernameRequest: getPendingUsernameChangeForUser(db, userId),
      currentAdminId: req.user!.id,
      error: 'You cannot delete your own account from here',
      success: null,
    });
  }

  const profile = getUserByIdForAdmin(db, userId);
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  const { reason } = req.body;
  const result = await deleteAccount(db, userId, req.user!.id, reason || undefined);

  if (!result.success) {
    return res.render('admin/user-profile', {
      title: 'Edit User Profile',
      profile,
      pendingUsernameRequest: getPendingUsernameChangeForUser(db, userId),
      currentAdminId: req.user!.id,
      error: result.error,
      success: null,
    });
  }

  redirectTo(res,'/admin');
});

// GET /admin/users/:id/edit
adminWebRouter.get('/users/:id/edit', (req, res) => {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM users WHERE id = ?').get((req.params.id as string)) as any;
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  res.render('admin/user-edit', {
    title: 'Edit User (Admin)',
    profile,
    error: null,
    isAdminUser: req.user!.role === 'admin',
  });
});

// POST /admin/users/:id/edit
adminWebRouter.post('/users/:id/edit', requireRole('admin'), (req, res) => {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM users WHERE id = ?').get((req.params.id as string)) as any;
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  const { role, trust, reason } = req.body;

  updateUser(db, (req.params.id as string), {
    role: role || undefined,
    trust: trust || undefined,
  });

  if (role && role !== profile.role) {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'user',
      targetId: (req.params.id as string),
      action: 'role_change',
      reason: reason ?? `Changed role from ${profile.role} to ${role}`,
    });
  }
  if (trust && trust !== profile.trust) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: 'trust_change', reason });
  }

  redirectTo(res,'/admin');
});

// POST /admin/username-requests/:id/approve
adminWebRouter.post('/username-requests/:id/approve', (req, res) => {
  const db = getDb();
  const { reason } = req.body;
  const result = approveUsernameChangeRequest(db, (req.params.id as string), req.user!.id, reason || undefined);
  if (!result.success) {
    const pending = getPendingApprovals(db);
    const recentLog = getAuditLog(db, { limit: 10 });
    const pendingThreads = db.prepare(`
      SELECT t.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, c.name as categoryName
      FROM threads t JOIN users u ON t.authorUserId = u.id JOIN categories c ON t.categoryId = c.id
      WHERE t.approvalStatus = 'new' AND t.isDeleted = 0 ORDER BY t.createdAt DESC LIMIT 10
    `).all();
    const pendingPosts = db.prepare(`
      SELECT p.*, ${AUTHOR_USERNAME_SQL}, ${AUTHOR_IS_DELETED_SQL}, ${AUTHOR_TRUST_SQL}, th.title as threadTitle
      FROM posts p JOIN users u ON p.authorUserId = u.id JOIN threads th ON p.threadId = th.id
      WHERE p.approvalStatus = 'new' AND p.isDeleted = 0 ORDER BY p.createdAt DESC LIMIT 10
    `).all();
    return res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      pending,
      recentLog: recentLog.data,
      pendingThreads,
      pendingPosts,
      pendingUsernameChanges: listPendingUsernameChangeRequests(db),
      error: result.error,
    });
  }
  redirectTo(res,'/admin');
});

// POST /admin/username-requests/:id/reject
adminWebRouter.post('/username-requests/:id/reject', (req, res) => {
  const db = getDb();
  const { reason } = req.body;
  rejectUsernameChangeRequest(db, (req.params.id as string), req.user!.id, reason || undefined);
  redirectTo(res,'/admin');
});

// GET /admin/categories
adminWebRouter.get('/categories', requireRole('admin'), (_req, res) => {
  const db = getDb();
  const categories = listCategories(db, true);
  res.render('admin/categories', { title: 'Manage Categories', categories, error: null, success: null });
});

// GET /admin/categories/new
adminWebRouter.get('/categories/new', requireRole('admin'), (_req, res) => {
  res.render('admin/category-edit', { title: 'New Category', category: null, error: null });
});

// POST /admin/categories/new
adminWebRouter.post('/categories/new', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, description, sortOrder, isHidden } = req.body;

  if (!name || name.trim().length < 2 || name.trim().length > 80) {
    return res.render('admin/category-edit', {
      title: 'New Category',
      category: null,
      error: 'Category name must be 2–80 characters',
    });
  }

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim()) as { id: string } | undefined;
  if (existing) {
    return res.render('admin/category-edit', {
      title: 'New Category',
      category: null,
      error: 'A category with that name already exists',
    });
  }

  createCategory(db, {
    name: name.trim(),
    description: description?.trim() || undefined,
    sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
    isHidden: isHidden === '1' ? 1 : 0,
  });

  redirectTo(res,'/admin/categories');
});

// GET /admin/categories/:id/edit
adminWebRouter.get('/categories/:id/edit', requireRole('admin'), (req, res) => {
  const db = getDb();
  const category = getCategoryById(db, (req.params.id as string));
  if (!category) {return res.status(404).render('error', { title: 'Not Found', message: 'Category not found', statusCode: 404 });}

  res.render('admin/category-edit', { title: 'Edit Category', category, error: null });
});

// POST /admin/categories/:id/edit
adminWebRouter.post('/categories/:id/edit', requireRole('admin'), (req, res) => {
  const db = getDb();
  const id = req.params.id as string;
  const category = getCategoryById(db, id);
  if (!category) {return res.status(404).render('error', { title: 'Not Found', message: 'Category not found', statusCode: 404 });}

  const { name, description, sortOrder, isHidden } = req.body;

  if (!name || name.trim().length < 2 || name.trim().length > 80) {
    return res.render('admin/category-edit', {
      title: 'Edit Category',
      category,
      error: 'Category name must be 2–80 characters',
    });
  }

  const conflict = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name.trim(), id) as { id: string } | undefined;
  if (conflict) {
    return res.render('admin/category-edit', {
      title: 'Edit Category',
      category,
      error: 'A category with that name already exists',
    });
  }

  updateCategory(db, id, {
    name: name.trim(),
    description: description?.trim() || undefined,
    sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
    isHidden: isHidden === '1' ? 1 : 0,
  });

  redirectTo(res,'/admin/categories');
});

// POST /admin/categories/:id/delete
adminWebRouter.post('/categories/:id/delete', requireRole('admin'), (req, res) => {
  const db = getDb();
  const result = deleteCategory(db, req.params.id as string);
  if (!result.ok) {
    const categories = listCategories(db, true);
    return res.render('admin/categories', {
      title: 'Manage Categories',
      categories,
      error: result.error,
      success: null,
    });
  }

  writeAuditLog(db, {
    actorUserId: req.user!.id,
    targetType: 'thread',
    targetId: req.params.id as string,
    action: 'category_delete',
    reason: 'Category deleted; threads migrated to General Discussion',
  });

  redirectTo(res,'/admin/categories');
});

// GET /admin/settings
adminWebRouter.get('/settings', requireRole('admin'), (req, res) => {
  const db = getDb();
  const settings = getForumSettings(db);
  const categories = listCategories(db, true);

  res.render('admin/settings', {
    title: 'Forum Settings',
    settings,
    categories,
    error: null,
    success: null,
  });
});

// POST /admin/settings
adminWebRouter.post('/settings', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { forumName, homeIntro, topBarLinks, themeColorPrimary, themeColorAccent, themeColorSurface } = req.body;

  let parsedLinks = [];
  try {
    parsedLinks = topBarLinks ? JSON.parse(topBarLinks) : [];
  } catch {
    const categories = listCategories(db, true);
    return res.render('admin/settings', {
      title: 'Forum Settings',
      settings: getForumSettings(db),
      categories,
      error: 'Invalid JSON for top bar links',
      success: null,
    });
  }

  // Validate hex colors
  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  if (themeColorPrimary && !hexRegex.test(themeColorPrimary)) {
    const categories = listCategories(db, true);
    return res.render('admin/settings', {
      title: 'Forum Settings',
      settings: getForumSettings(db),
      categories,
      error: 'Invalid hex color for primary color',
      success: null,
    });
  }

  if (themeColorSurface && !hexRegex.test(themeColorSurface)) {
    const categories = listCategories(db, true);
    return res.render('admin/settings', {
      title: 'Forum Settings',
      settings: getForumSettings(db),
      categories,
      error: 'Invalid hex color for surface color',
      success: null,
    });
  }

  updateForumSettings(db, {
    forumName: forumName || undefined,
    homeIntro: homeIntro ?? '',
    topBarLinks: parsedLinks,
    themeColorPrimary: themeColorPrimary || undefined,
    themeColorAccent: themeColorAccent || undefined,
    themeColorSurface: themeColorSurface || undefined,
  });

  const categories = listCategories(db, true);
  res.render('admin/settings', {
    title: 'Forum Settings',
    settings: getForumSettings(db),
    categories,
    error: null,
    success: 'Settings saved.',
  });
});
