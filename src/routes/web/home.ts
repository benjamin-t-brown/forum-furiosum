import { Router } from 'express';
import { getDb } from '../../db/db';
import { listCategories } from '../../services/categories';
import { listThreads } from '../../services/threads';

export const homeRouter = Router();

homeRouter.get('/', (req, res) => {
  const db = getDb();
  const role = req.user?.role;
  const categories = listCategories(db, role === 'admin' || role === 'moderator');

  // Get recent threads per category for display
  const categoriesWithThreads = categories.map(cat => ({
    ...cat,
    recentThreads: listThreads(db, { categoryId: cat.id, limit: 5, role }).data,
  }));

  res.render('home', {
    title: res.locals.forumName,
    categories: categoriesWithThreads,
  });
});
