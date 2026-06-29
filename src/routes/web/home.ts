import { Router } from 'express';
import { getDb } from '../../db/db';
import { listCategories } from '../../services/categories';
import { getForumSettings } from '../../services/settings';
import { listThreads } from '../../services/threads';
import { renderBody } from '../../utils/renderBody';
import { HOME_THREADS_PER_PAGE } from '../../utils/categoryPagination';

export const homeRouter = Router();

homeRouter.get('/', (req, res) => {
  const db = getDb();
  const role = req.user?.role;
  const isStaff = role === 'admin' || role === 'moderator';
  const showDeleted = isStaff && req.query.showDeleted === '1';
  const categories = listCategories(db, isStaff);

  const categoriesWithThreads = categories.map(cat => ({
    ...cat,
    threads: listThreads(db, {
      categoryId: cat.id,
      page: 1,
      limit: HOME_THREADS_PER_PAGE,
      role,
      includeDeleted: showDeleted,
    }),
  }));

  let notice: string | null = null;
  if (req.query.thread === 'pending') {
    notice = 'Your thread was submitted and is pending approval. It will appear on the forum once a moderator approves it.';
  } else if (req.query.notice === 'account-deleted') {
    notice = 'Your account has been deleted. Your posts remain but your username is no longer shown.';
  }

  const { homeIntro } = getForumSettings(db);
  const homeIntroHtml = homeIntro.trim() ? renderBody(homeIntro) : null;

  res.render('home', {
    title: res.locals.forumName,
    categories: categoriesWithThreads,
    notice,
    homeIntroHtml,
    showDeleted,
  });
});
