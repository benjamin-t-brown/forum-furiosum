import { Router, type Request } from 'express';
import { getDb } from '../../db/db';
import { getUserById, getUserByIdForAdmin, deleteAccount } from '../../services/users';
import { verifyPassword } from '../../services/auth';
import { deleteSession } from '../../services/session';
import { requireRegisteredUser } from '../../middleware/requireAuth';
import {
  createUsernameChangeRequest,
  getPendingUsernameChangeForUser,
} from '../../services/usernameChanges';
import { redirectTo } from '../../utils/basePath';

export const usersWebRouter = Router();

function canEditProfile(req: Request, profileId: string): boolean {
  return req.user!.id === profileId || req.user!.role === 'admin';
}

// GET /users/:id
usersWebRouter.get('/:id', (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;
  const isStaff = req.user?.role === 'admin' || req.user?.role === 'moderator';
  const profile = isStaff
    ? getUserByIdForAdmin(db, userId)
    : getUserById(db, userId);
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}
  res.render('users/show', { title: profile.username, profile });
});

// GET /users/:id/edit
usersWebRouter.get('/:id/edit', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const profile = getUserById(db, (req.params.id as string));
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  if (!canEditProfile(req, profile.id)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot edit this profile', statusCode: 403 });
  }

  const pendingUsernameRequest = req.user!.id === profile.id
    ? getPendingUsernameChangeForUser(db, profile.id)
    : null;

  res.render('users/edit', {
    title: 'Edit Profile',
    profile,
    pendingUsernameRequest,
    csrfToken: res.locals.csrfToken,
    error: null,
    success: null,
  });
});

// POST /users/:id/username-request
usersWebRouter.post('/:id/username-request', requireRegisteredUser, (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;
  const profile = getUserById(db, userId);
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  if (req.user!.id !== profile.id) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot change this username', statusCode: 403 });
  }

  const { requestedUsername } = req.body;
  const result = createUsernameChangeRequest(db, userId, (requestedUsername ?? '').trim());

  const pendingUsernameRequest = getPendingUsernameChangeForUser(db, userId);
  res.render('users/edit', {
    title: 'Edit Profile',
    profile,
    pendingUsernameRequest,
    csrfToken: res.locals.csrfToken,
    error: result.success ? null : result.error,
    success: result.success ? 'Username change submitted for admin approval.' : null,
  });
});

// POST /users/:id/delete
usersWebRouter.post('/:id/delete', requireRegisteredUser, async (req, res) => {
  const db = getDb();
  const userId = req.params.id as string;
  const profile = db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0').get(userId) as
    { id: string; passwordHash: string } | undefined;
  if (!profile) {return res.status(404).render('error', { title: 'Not Found', message: 'User not found', statusCode: 404 });}

  if (req.user!.id !== profile.id) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Cannot delete this account', statusCode: 403 });
  }

  const { password, confirmDelete } = req.body;
  if (confirmDelete !== 'DELETE') {
    const pendingUsernameRequest = getPendingUsernameChangeForUser(db, userId);
    return res.render('users/edit', {
      title: 'Edit Profile',
      profile: getUserById(db, userId)!,
      pendingUsernameRequest,
      csrfToken: res.locals.csrfToken,
      error: 'Type DELETE to confirm account deletion',
      success: null,
    });
  }

  const valid = await verifyPassword(profile.passwordHash, password ?? '');
  if (!valid) {
    const pendingUsernameRequest = getPendingUsernameChangeForUser(db, userId);
    return res.render('users/edit', {
      title: 'Edit Profile',
      profile: getUserById(db, userId)!,
      pendingUsernameRequest,
      csrfToken: res.locals.csrfToken,
      error: 'Incorrect password',
      success: null,
    });
  }

  await deleteAccount(db, userId, userId, 'Self-service account deletion');

  if (req.sessionId) {deleteSession(db, req.sessionId);}
  res.clearCookie('ff_session');
  redirectTo(res, '/?notice=account-deleted');
});
