import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { hashPassword, verifyPassword, createUser, loginUser, getUserByEmail, getUserByUsername } from '../services/auth';

describe('Auth service', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('hashPassword / verifyPassword', () => {
    it('hashes a password and verifies it correctly', async () => {
      const hash = await hashPassword('secret123');
      expect(hash).not.toBe('secret123');
      expect(await verifyPassword(hash, 'secret123')).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('secret123');
      expect(await verifyPassword(hash, 'wrongpassword')).toBe(false);
    });
  });

  describe('createUser', () => {
    it('creates a user with hashed password', async () => {
      const user = await createUser(db, 'testuser', 'test@example.com', 'password123');
      expect(user.id).toBeTruthy();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).not.toBe('password123');
      expect(user.role).toBe('user');
    });

    it('normalizes email to lowercase', async () => {
      const user = await createUser(db, 'testuser2', 'TEST@EXAMPLE.COM', 'password123');
      expect(user.email).toBe('test@example.com');
    });

    it('creates admin user with correct role and verified status', async () => {
      const user = await createUser(db, 'adminuser', 'admin@example.com', 'password123', 'admin');
      expect(user.role).toBe('admin');
      expect(user.trust).toBe('verified');
    });

    it('creates moderators with trusted status', async () => {
      const user = await createUser(db, 'moduser', 'mod@example.com', 'password123', 'moderator');
      expect(user.trust).toBe('trusted');
    });

    it('creates regular users with new status', async () => {
      const user = await createUser(db, 'newbie', 'newbie@example.com', 'password123');
      expect(user.trust).toBe('new');
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      await createUser(db, 'logintest', 'login@example.com', 'mypassword');
    });

    it('logs in with correct email', async () => {
      const user = await loginUser(db, 'login@example.com', 'mypassword');
      expect(user).not.toBeNull();
      expect(user!.username).toBe('logintest');
    });

    it('logs in with correct username (case-insensitive)', async () => {
      const user = await loginUser(db, 'LOGINTEST', 'mypassword');
      expect(user).not.toBeNull();
    });

    it('returns null for wrong password', async () => {
      const user = await loginUser(db, 'login@example.com', 'wrongpassword');
      expect(user).toBeNull();
    });

    it('returns null for non-existent user', async () => {
      const user = await loginUser(db, 'nobody@example.com', 'password');
      expect(user).toBeNull();
    });
  });

  describe('getUserByEmail / getUserByUsername', () => {
    beforeEach(async () => {
      await createUser(db, 'findme', 'findme@example.com', 'password123');
    });

    it('finds user by email', () => {
      const user = getUserByEmail(db, 'findme@example.com');
      expect(user).not.toBeNull();
      expect(user!.username).toBe('findme');
    });

    it('finds user by username (case-insensitive)', () => {
      const user = getUserByUsername(db, 'FINDME');
      expect(user).not.toBeNull();
    });

    it('returns null for missing user', () => {
      expect(getUserByEmail(db, 'missing@example.com')).toBeNull();
      expect(getUserByUsername(db, 'missing')).toBeNull();
    });
  });
});
