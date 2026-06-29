import { Router } from 'express';
import { getDb } from '../../db/db';
import { getCategoryBySlug } from '../../services/categories';
import { listThreads } from '../../services/threads';
import {
  CATEGORY_THREADS_PER_PAGE,
  categoryPageHref,
  parsePageQuery,
} from '../../utils/categoryPagination';

export const categoriesWebRouter = Router();

categoriesWebRouter.get('/:slug', (req, res) => {
  const db = getDb();
  const role = req.user?.role;
  const isStaff = role === 'admin' || role === 'moderator';
  const showDeleted = isStaff && req.query.showDeleted === '1';
  const category = getCategoryBySlug(db, req.params.slug);

  if (!category || (category.isHidden && !isStaff)) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Category not found',
      statusCode: 404,
    });
  }

  const page = parsePageQuery(req.query);
  const threads = listThreads(db, {
    categoryId: category.id,
    page,
    limit: CATEGORY_THREADS_PER_PAGE,
    role,
    includeDeleted: showDeleted,
  });

  res.render('categories/show', {
    title: category.name,
    category,
    threads,
    page,
    showDeleted,
    categoryPageHref: (targetPage: number) =>
      categoryPageHref(category.slug, targetPage, showDeleted),
  });
});
