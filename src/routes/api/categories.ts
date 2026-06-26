import { Router } from 'express';
import { getDb } from '../../db/db';
import { listCategories, getCategoryById } from '../../services/categories';
import { ok, fail } from './helpers';

export const categoriesRouter = Router();

// GET /api/v1/categories
categoriesRouter.get('/', (req, res) => {
  const db = getDb();
  const role = req.user?.role;
  const includeHidden = role === 'admin' || role === 'moderator';
  ok(res, listCategories(db, includeHidden));
});

// GET /api/v1/categories/:id
categoriesRouter.get('/:id', (req, res) => {
  const db = getDb();
  const category = getCategoryById(db, req.params.id);
  if (!category) {return void fail(res, 404, 'NOT_FOUND', 'Category not found');}
  if (category.isHidden && req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
    return void fail(res, 404, 'NOT_FOUND', 'Category not found');
  }
  ok(res, category);
});
