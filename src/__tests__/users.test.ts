import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread } from '../services/threads';
import { createPost } from '../services/posts';
import { deleteAccount, adminSetUsername, adminSetPassword, searchUsers } from '../services/users';
import { loginUser } from '../services/auth';
import {
  createUsernameChangeRequest,
  approveUsernameChangeRequest,
  getPendingUsernameChangeForUser,
} from '../services/usernameChanges';
import { listPosts } from '../services/posts';
import { REDACTED_USERNAME } from '../utils/authorDisplay';

describe('User profile changes', () => {
  let db: ReturnType<typeof createTestDb>;
  let userId: string;
  let adminId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    db = createTestDb();
    const user = await createUser(db, 'oldname', 'user@example.com', 'password123');
    userId = user.id;
    const admin = await createUser(db, 'adminuser', 'admin@example.com', 'password123', 'admin');
    adminId = admin.id;
  });

  describe('username change requests', () => {
    it('creates a pending username change request', () => {
      const result = createUsernameChangeRequest(db, userId, 'newname');
      expect(result.success).toBe(true);
      expect(getPendingUsernameChangeForUser(db, userId)?.requestedUsername).toBe('newname');
    });

    it('rejects invalid usernames', () => {
      const result = createUsernameChangeRequest(db, userId, 'ab');
      expect(result.success).toBe(false);
    });

    it('rejects reserved and banned usernames', () => {
      expect(createUsernameChangeRequest(db, userId, 'admin').success).toBe(false);
      expect(createUsernameChangeRequest(db, userId, 'badfuckname').success).toBe(false);
    });

    it('rejects duplicate pending requests', () => {
      createUsernameChangeRequest(db, userId, 'newname');
      const result = createUsernameChangeRequest(db, userId, 'othername');
      expect(result.success).toBe(false);
    });

    it('approves a username change', () => {
      const created = createUsernameChangeRequest(db, userId, 'newname');
      const result = approveUsernameChangeRequest(db, created.request!.id, adminId);
      expect(result.success).toBe(true);
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string };
      expect(user.username).toBe('newname');
      expect(getPendingUsernameChangeForUser(db, userId)).toBeNull();
    });
  });

  describe('adminSetUsername', () => {
    it('sets username directly', () => {
      const result = adminSetUsername(db, userId, 'newname', adminId);
      expect(result.success).toBe(true);
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string };
      expect(user.username).toBe('newname');
    });

    it('rejects taken usernames', async () => {
      await createUser(db, 'taken', 'taken@example.com', 'password123');
      const result = adminSetUsername(db, userId, 'taken', adminId);
      expect(result.success).toBe(false);
    });
  });

  describe('adminSetPassword', () => {
    it('sets a new password and invalidates the old one', async () => {
      const result = await adminSetPassword(db, userId, 'newpassword99', adminId);
      expect(result.success).toBe(true);
      expect(await loginUser(db, 'user@example.com', 'password123')).toBeNull();
      expect(await loginUser(db, 'user@example.com', 'newpassword99')).not.toBeNull();
    });

    it('rejects short passwords', async () => {
      const result = await adminSetPassword(db, userId, 'short', adminId);
      expect(result.success).toBe(false);
    });

    it('rejects deleted accounts', async () => {
      await deleteAccount(db, userId, adminId, 'test delete');
      const result = await adminSetPassword(db, userId, 'newpassword99', adminId);
      expect(result.success).toBe(false);
    });
  });

  describe('searchUsers', () => {
    it('finds users by username', () => {
      const results = searchUsers(db, 'oldname');
      expect(results.some(u => u.id === userId)).toBe(true);
    });

    it('finds users by email', () => {
      const results = searchUsers(db, 'user@example');
      expect(results.some(u => u.id === userId)).toBe(true);
    });

    it('returns empty results for blank query', () => {
      expect(searchUsers(db, '   ')).toEqual([]);
    });

    it('can include deleted users for admin search', async () => {
      await deleteAccount(db, userId, adminId, 'test delete');
      expect(searchUsers(db, 'oldname')).toEqual([]);
      expect(searchUsers(db, '[deleted]', { includeDeleted: true }).some(u => u.id === userId)).toBe(true);
    });
  });

  describe('deleteAccount', () => {
    it('redacts username on posts but keeps content', async () => {
      const thread = createThread(db, {
        categoryId,
        authorUserId: adminId,
        title: 'Thread',
        body: 'Opening post',
      });
      createPost(db, { threadId: thread.id, authorUserId: userId, body: 'My reply', approvalStatus: 'approved' });

      const result = await deleteAccount(db, userId, userId, 'self delete');
      expect(result.success).toBe(true);

      const posts = listPosts(db, thread.id, { role: 'user' });
      expect(posts.data[0].body).toBe('My reply');
      expect(posts.data[0].authorUsername).toBe(REDACTED_USERNAME);
      expect(posts.data[0].authorIsDeleted).toBe(1);

      const deleted = db.prepare('SELECT isDeleted, username FROM users WHERE id = ?').get(userId) as
        { isDeleted: number; username: string };
      expect(deleted.isDeleted).toBe(1);
      expect(deleted.username).toMatch(/^\[deleted\]-/);
    });
  });
});
