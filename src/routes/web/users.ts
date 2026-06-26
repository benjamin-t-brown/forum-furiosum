import { Router } from 'express';
import { getDb } from '../../db/db';
import { getUserById, updateUser } from '../../services/users';
import { requireAuth } from '../../middleware/requireAuth';
import { csrfProtection } from '../../middleware/csrf';

export const usersWebRouter = Router();

// GET /users/:id
usersWebRouter.get('/:id', (req, res) => {
  const db = getDb();
  const profile = getUserById(db, (req.params.id as string));
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}
  res.render('users/show', { title: profile.username, profile });
});

// GET /users/:id/edit
usersWebRouter.get('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const profile = getUserById(db, (req.params.id as string));
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  if (req.user!.id !== profile.id && req.user!.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this profile', statusCode: 403 });
  }

  res.render('users/edit', { title: 'Edit Profile', profile, csrfToken: res.locals.csrfToken, error: null });
});

// POST /users/:id/edit
usersWebRouter.post('/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const profile = getUserById(db, (req.params.id as string));
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  if (req.user!.id !== profile.id && req.user!.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this profile', statusCode: 403 });
  }

  const { theme } = req.body;
  updateUser(db, (req.params.id as string), { theme: theme || null });
  res.redirect(`/users/${(req.params.id as string)}`);
});
