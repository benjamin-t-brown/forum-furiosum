import { describe, it, expect } from 'vitest';
import { canPostToThread, canEditPostOnThread, isStaff } from '../utils/threadLock';

describe('threadLock', () => {
  describe('isStaff', () => {
    it('returns true for admin and moderator', () => {
      expect(isStaff('admin')).toBe(true);
      expect(isStaff('moderator')).toBe(true);
    });

    it('returns false for regular users', () => {
      expect(isStaff('user')).toBe(false);
    });
  });

  describe('canPostToThread', () => {
    it('allows anyone when thread is not locked', () => {
      expect(canPostToThread(false, { role: 'user' })).toBe(true);
      expect(canPostToThread(false, null)).toBe(true);
    });

    it('blocks non-staff when thread is locked', () => {
      expect(canPostToThread(true, { role: 'user' })).toBe(false);
      expect(canPostToThread(true, null)).toBe(false);
    });

    it('allows staff when thread is locked', () => {
      expect(canPostToThread(true, { role: 'admin' })).toBe(true);
      expect(canPostToThread(true, { role: 'moderator' })).toBe(true);
    });
  });

  describe('canEditPostOnThread', () => {
    const authorId = 'author-id';
    const otherId = 'other-id';

    it('allows staff to edit any post on locked threads', () => {
      expect(canEditPostOnThread(true, { role: 'admin' }, authorId, 'mod-id')).toBe(true);
      expect(canEditPostOnThread(true, { role: 'moderator' }, authorId, 'mod-id')).toBe(true);
    });

    it('allows owners to edit on unlocked threads', () => {
      expect(canEditPostOnThread(false, { role: 'user' }, authorId, authorId)).toBe(true);
    });

    it('blocks owners from editing on locked threads', () => {
      expect(canEditPostOnThread(true, { role: 'user' }, authorId, authorId)).toBe(false);
    });

    it('blocks other users from editing', () => {
      expect(canEditPostOnThread(false, { role: 'user' }, authorId, otherId)).toBe(false);
      expect(canEditPostOnThread(true, { role: 'user' }, authorId, otherId)).toBe(false);
    });

    it('requires a signed-in viewer', () => {
      expect(canEditPostOnThread(false, null, authorId, authorId)).toBe(false);
    });
  });
});
