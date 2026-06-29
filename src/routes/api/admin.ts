import { Router } from 'express';
import { getDb } from '../../db/db';
import { listUsers, updateUser, adminSetPassword } from '../../services/users';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { writeAuditLog, getAuditLog, getPendingApprovals } from '../../services/moderation';
import { ok, fail, parsePagination } from './helpers';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin', 'moderator'));

// GET /api/v1/admin/users
adminRouter.get('/users', (req, res) => {
  const { page, limit } = parsePagination(req);
  const db = getDb();
  const result = listUsers(db, { page, limit, includeDeleted: true });
  // Strip password hashes
  const safeData = result.data.map(({ passwordHash: _, ...u }) => u);
  ok(res, { ...result, data: safeData });
});

// PATCH /api/v1/admin/users/:id
adminRouter.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const db = getDb();
  const { role, trust, isDeleted, password, reason } = req.body;
  const userId = req.params.id as string;

  const target = listUsers(db, { includeDeleted: true }).data.find(u => u.id === userId);
  if (!target) {return void fail(res, 404, 'NOT_FOUND', 'User not found');}

  if (password !== undefined) {
    const passwordResult = await adminSetPassword(db, userId, password, req.user!.id, reason);
    if (!passwordResult.success) {
      return void fail(res, 400, 'VALIDATION_ERROR', passwordResult.error ?? 'Invalid password');
    }
  }

  const updated = updateUser(db, userId, { role, trust, isDeleted });

  if (role && role !== target.role) {
    writeAuditLog(db, {
      actorUserId: req.user!.id,
      targetType: 'user',
      targetId: userId,
      action: 'role_change',
      reason: reason ?? `Changed role from ${target.role} to ${role}`,
    });
  }
  if (trust && trust !== target.trust) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: 'trust_change', reason });
  }
  if (isDeleted !== undefined && isDeleted !== target.isDeleted) {
    writeAuditLog(db, { actorUserId: req.user!.id, targetType: 'user', targetId: (req.params.id as string), action: isDeleted ? 'delete' : 'restore', reason });
  }

  if (!updated) {return void fail(res, 404, 'NOT_FOUND', 'User not found');}
  const { passwordHash: _, ...safeUser } = updated;
  ok(res, safeUser);
});

// GET /api/v1/admin/audit-log
adminRouter.get('/audit-log', (req, res) => {
  const { page, limit } = parsePagination(req);
  const db = getDb();
  ok(res, getAuditLog(db, { page, limit }));
});

// GET /api/v1/admin/pending
adminRouter.get('/pending', (req, res) => {
  const db = getDb();
  ok(res, getPendingApprovals(db));
});
