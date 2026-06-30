import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread, listThreads, getThreadById, updateThread, deleteThread, isValidStatusTransition } from '../services/threads';

describe('Thread service', () => {
  let db: ReturnType<typeof createTestDb>;
  let userId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001'; // seeded in migration

  beforeEach(async () => {
    db = createTestDb();
    const user = await createUser(db, 'threaduser', 'thread@example.com', 'password123');
    userId = user.id;
  });

  describe('createThread', () => {
    it('creates a thread with new approvalStatus by default', () => {
      const thread = createThread(db, { categoryId, authorUserId: userId, title: 'Test Thread', body: 'Hello world' });
      expect(thread.id).toBeTruthy();
      expect(thread.title).toBe('Test Thread');
      expect(thread.approvalStatus).toBe('new');
      expect(thread.isHidden).toBe(0);
      expect(thread.isDeleted).toBe(0);
    });

    it('creates a thread with explicit approvalStatus', () => {
      const thread = createThread(db, {
        categoryId,
        authorUserId: userId,
        title: 'Trusted Thread',
        body: 'Hello world',
        approvalStatus: 'approved',
      });
      expect(thread.approvalStatus).toBe('approved');
    });

    it('creates a thread with replyApprovalTrust when set', () => {
      const thread = createThread(db, {
        categoryId,
        authorUserId: userId,
        title: 'Threshold thread',
        body: 'Hello world',
        replyApprovalTrust: 'verified',
      });
      expect(thread.replyApprovalTrust).toBe('verified');
    });

    it('creates a thread with embedEnabled when set', () => {
      const thread = createThread(db, {
        categoryId,
        authorUserId: userId,
        title: 'Embed thread',
        body: 'Hello world',
        embedEnabled: 1,
      });
      expect(thread.embedEnabled).toBe(1);
    });
  });

  describe('listThreads', () => {
    beforeEach(() => {
      // Create an approved thread and a pending thread
      const t1 = createThread(db, { categoryId, authorUserId: userId, title: 'Approved Thread', body: 'body' });
      updateThread(db, t1.id, { approvalStatus: 'approved' });
      createThread(db, { categoryId, authorUserId: userId, title: 'Pending Thread', body: 'body' });
    });

    it('shows only approved threads to regular users', () => {
      const result = listThreads(db, { role: 'user' });
      expect(result.data.every(t => t.approvalStatus === 'approved')).toBe(true);
      expect(result.data.some(t => t.title === 'Pending Thread')).toBe(false);
    });

    it('shows all threads to moderators', () => {
      const result = listThreads(db, { role: 'moderator' });
      expect(result.data.length).toBeGreaterThanOrEqual(2);
    });

    it('hides deleted threads from moderators', () => {
      const pending = createThread(db, { categoryId, authorUserId: userId, title: 'Deleted Pending', body: 'body' });
      deleteThread(db, pending.id);

      const result = listThreads(db, { role: 'moderator' });
      expect(result.data.some(t => t.id === pending.id)).toBe(false);
    });

    it('shows deleted threads to moderators when includeDeleted is set', () => {
      const pending = createThread(db, { categoryId, authorUserId: userId, title: 'Deleted Pending', body: 'body' });
      deleteThread(db, pending.id);

      const result = listThreads(db, { role: 'moderator', includeDeleted: true });
      expect(result.data.some(t => t.id === pending.id)).toBe(true);
    });

    it('paginates results', () => {
      // Create more threads
      for (let i = 0; i < 5; i++) {
        const t = createThread(db, { categoryId, authorUserId: userId, title: `Thread ${i}`, body: 'body' });
        updateThread(db, t.id, { approvalStatus: 'approved' });
      }
      const page1 = listThreads(db, { role: 'user', page: 1, limit: 3 });
      const page2 = listThreads(db, { role: 'user', page: 2, limit: 3 });
      expect(page1.data.length).toBe(3);
      expect(page1.totalPages).toBeGreaterThan(1);
      expect(page2.data.length).toBeGreaterThan(0);
    });
  });

  describe('updateThread', () => {
    it('updates thread title and body', () => {
      const thread = createThread(db, { categoryId, authorUserId: userId, title: 'Old Title', body: 'old body' });
      updateThread(db, thread.id, { title: 'New Title', body: 'new body', lastEditedByUserId: userId });
      const updated = getThreadById(db, thread.id, 'admin');
      expect(updated!.title).toBe('New Title');
      expect(updated!.lastEditedByUserId).toBe(userId);
    });

    it('updates replyApprovalTrust', () => {
      const thread = createThread(db, { categoryId, authorUserId: userId, title: 'Thread', body: 'body' });
      updateThread(db, thread.id, { replyApprovalTrust: 'new' });
      expect(getThreadById(db, thread.id, 'admin')!.replyApprovalTrust).toBe('new');
    });

    it('updates hidden and deleted flags', () => {
      const thread = createThread(db, { categoryId, authorUserId: userId, title: 'Thread', body: 'body' });
      updateThread(db, thread.id, { isHidden: 1, isDeleted: 1 });
      const updated = getThreadById(db, thread.id, 'admin')!;
      expect(updated.isHidden).toBe(1);
      expect(updated.isDeleted).toBe(1);
    });
  });

  describe('deleteThread', () => {
    it('soft-deletes a thread', () => {
      const thread = createThread(db, { categoryId, authorUserId: userId, title: 'To Delete', body: 'body' });
      deleteThread(db, thread.id);
      expect(getThreadById(db, thread.id, 'user')).toBeNull();
      expect(getThreadById(db, thread.id, 'admin')).not.toBeNull();
    });
  });

  describe('isValidStatusTransition', () => {
    it('allows new -> approved', () => expect(isValidStatusTransition('new', 'approved')).toBe(true));
    it('allows new -> unapproved', () => expect(isValidStatusTransition('new', 'unapproved')).toBe(true));
    it('allows approved -> unapproved', () => expect(isValidStatusTransition('approved', 'unapproved')).toBe(true));
    it('disallows approved -> new', () => expect(isValidStatusTransition('approved', 'new')).toBe(false));
    it('disallows unapproved -> new', () => expect(isValidStatusTransition('unapproved', 'new')).toBe(false));
  });
});
