import { Router } from 'express';
import { getDb } from '../../db/db';
import { getUserById, updateUser } from '../../services/users';
import { requireAuth } from '../../middleware/requireAuth';
import { ok, fail } from './helpers';

export const usersRouter = Router();

// GET /api/v1/users/:id
usersRouter.get('/:id', (req, res) => {
  const db = getDb();
  const user = getUserById(db, (req.params.id as string));
  if (!user) {return void fail(res, 404, 'NOT_FOUND', 'User not found');}
  // Never expose passwordHash
  const { passwordHash: _, ...safeUser } = user;
  ok(res, safeUser);
});

// PATCH /api/v1/users/:id
usersRouter.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user!;

  if (user.id !== (req.params.id as string) && user.role !== 'admin') {
    return void fail(res, 403, 'FORBIDDEN', "Cannot edit another user's profile");
  }

  const { theme } = req.body;
  const updated = updateUser(db, (req.params.id as string), { theme });
  if (!updated) {return void fail(res, 404, 'NOT_FOUND', 'User not found');}
  const { passwordHash: _, ...safeUser } = updated;
  ok(res, safeUser);
});
