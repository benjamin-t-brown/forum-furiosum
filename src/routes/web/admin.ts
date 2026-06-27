import { Router } from 'express';
import { getDb } from '../../db/db';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { getThreadById, updateThread, isValidStatusTransition } from '../../services/threads';
import { getPostById, updatePost } from '../../services/posts';
import { getUserById, listUsers, updateUser } from '../../services/users';
import { listCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from '../../services/categories';
import { writeAuditLog, getAuditLog, getPendingApprovals } from '../../services/moderation';
import { getForumSettings, updateForumSettings } from '../../services/settings';

export const adminWebRouter = Router();

// All admin routes require auth + mod or admin role
adminWebRouter.use(requireAuth, requireRole('admin', 'moderator'));

// GET /admin — dashboard
adminWebRouter.get('/', (req, res) => {
  const db = getDb();
  const pending = getPendingApprovals(db);
  const recentLog = getAuditLog(db, { limit: 10 });

  // Count pending threads needing approval
  const pendingThreads = db.prepare(
    "SELECT t.*, u.username as authorUsername, c.name as categoryName FROM threads t JOIN users u ON t.authorUserId = u.id JOIN categories c ON t.categoryId = c.id WHERE t.approvalStatus = 'new' AND t.isDeleted = 0 ORDER BY t.createdAt DESC LIMIT 10"
  ).all();

  const pendingPosts = db.prepare(
    "SELECT p.*, u.username as authorUsername, th.title as threadTitle FROM posts p JOIN users u ON p.authorUserId = u.id JOIN threads th ON p.threadId = th.id WHERE p.approvalStatus = 'new' AND p.isDeleted = 0 ORDER BY p.createdAt DESC LIMIT 10"
  ).all();

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    pending,
    recentLog: recentLog.data,
    pendingThreads,
    pendingPosts,
  });
});

// GET /admin/threads/:id/edit
adminWebRouter.get('/threads/:id/edit', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const categories = listCategories(db, true);
  const embedUrl = `${req.protocol}://${req.get('host')}/embed/threads/${thread.id}`;
  res.render('admin/thread-edit', {
    title: 'Edit Thread (Admin)',
    thread,
    categories,
    embedUrl,
    error: null,
  });
});

// POST /admin/threads/:id/edit
adminWebRouter.post('/threads/:id/edit', (req, res) => {
  const db = getDb();
  const thread = getThreadById(db, (req.params.id as string), 'admin');
  if (!thread) {return res.status(404).render('error', { title: 'Not Found', message: 'Thread not found', statusCode: 404 });}

  const { title, body, categoryId, approvalStatus, isHidden, isDeleted, embedEnabled, reason } = req.body;

  // Validate status transition if changing
  if (approvalStatus && approvalStatus !== thread.approvalStatus) {
    if (!isValidStatusTransition(thread.approvalStatus, approvalStatus)) {
      const categories = listCategories(db, true);
      const embedUrl = `${req.protocol}://${req.get('host')}/embed/threads/${thread.id}`;
      return res.render('admin/thread-edit', {
        title: 'Edit Thread (Admin)',
        thread,
        categories,
        embedUrl,
        error: `Invalid status transition: ${thread.approvalStatus} → ${approvalStatus}`,
      });
    }
  }

  // Validate target category exists if provided
  if (categoryId && categoryId !== thread.categoryId) {
    const targetCat = getCategoryById(db, categoryId);
    if (!targetCat) {
      const categories = listCategories(db, true);
      const embedUrl = `${req.protocol}://${req.get('host')}/embed/threads/${thread.id}`;
      return res.render('admin/thread-edit', {
        title: 'Edit Thread (Admin)',
        thread,
        categories,
        embedUrl,
        error: 'Target category not found',
      });
    }
  }

  updateThread(db, (req.params.id as string), {
    title: title || undefined,
    body: body || undefined,
    categoryId: categoryId || undefined,
    approvalStatus: approvalStatus || undefined,
    isHidden: isHidden !== undefined ? (isHidden === '1' ? 1 : 0) : undefined,
    isDeleted: isDeleted !== undefined ? (isDeleted === '1' ? 1 : 0) : undefined,
    embedEnabled: embedEnabled === '1' ? 1 : 0,
    lastEditedByUserId: req.user!.id,
    lastEditedReason: reason || undefined,
  });

  writeAuditLog(db, {
    actorUserId: req.user!.id,
    targetType: 'thread',
    targetId: (req.params.id as string),
    action: 'admin_edit',
    reason: reason || undefined,
  });

  res.redirect('/admin');
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
    isHidden: isHidden !== undefined ? (isHidden === '1' ? 1 : 0) : undefined,
    isDeleted: isDeleted !== undefined ? (isDeleted === '1' ? 1 : 0) : undefined,
    lastEditedByUserId: req.user!.id,
    lastEditedReason: reason || undefined,
  });

  writeAuditLog(db, {
    actorUserId: req.user!.id,
    targetType: 'post',
    targetId: (req.params.id as string),
    action: 'admin_edit',
    reason: reason || undefined,
  });

  res.redirect('/admin');
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

  const { role, trust, isDeleted, reason } = req.body;

  updateUser(db, (req.params.id as string), {
    role: role || undefined,
    trust: trust || undefined,
    isDeleted: isDeleted !== undefined ? (isDeleted === '1' ? 1 : 0) : undefined,
  });

  if (role && role !== profile.role) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: 'role_change', reason });
  }
  if (trust && trust !== profile.trust) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: 'trust_change', reason });
  }
  if (isDeleted !== undefined) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: isDeleted === '1' ? 'delete' : 'restore', reason });
  }

  res.redirect('/admin');
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

  res.redirect('/admin/categories');
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

  res.redirect('/admin/categories');
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

  res.redirect('/admin/categories');
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
  const { forumName, topBarLinks, themeColorPrimary, themeColorAccent } = req.body;

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

  updateForumSettings(db, {
    forumName: forumName || undefined,
    topBarLinks: parsedLinks,
    themeColorPrimary: themeColorPrimary || undefined,
    themeColorAccent: themeColorAccent || undefined,
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
