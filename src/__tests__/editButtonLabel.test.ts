import { describe, it, expect } from 'vitest';
import { editButtonLabel } from '../utils/editButtonLabel';

describe('editButtonLabel', () => {
  const authorId = 'author-id';
  const otherId = 'other-id';

  it('returns null when user is not signed in', () => {
    expect(editButtonLabel(null, authorId)).toBeNull();
  });

  it('returns Edit for the content owner', () => {
    expect(editButtonLabel({ id: authorId, role: 'user' }, authorId)).toBe('Edit');
    expect(editButtonLabel({ id: authorId, role: 'admin' }, authorId)).toBe('Edit');
  });

  it('returns Admin Edit when an admin edits someone else\'s content', () => {
    expect(editButtonLabel({ id: otherId, role: 'admin' }, authorId)).toBe('Admin Edit');
  });

  it('returns Mod Edit when a moderator edits someone else\'s content', () => {
    expect(editButtonLabel({ id: otherId, role: 'moderator' }, authorId)).toBe('Mod Edit');
  });

  it('returns null for regular users on others\' content', () => {
    expect(editButtonLabel({ id: otherId, role: 'user' }, authorId)).toBeNull();
  });

  it('returns null for owners when the thread is locked', () => {
    expect(editButtonLabel({ id: authorId, role: 'user' }, authorId, { threadLocked: true })).toBeNull();
  });

  it('still allows staff to edit when the thread is locked', () => {
    expect(editButtonLabel({ id: otherId, role: 'admin' }, authorId, { threadLocked: true })).toBe('Admin Edit');
    expect(editButtonLabel({ id: authorId, role: 'moderator' }, authorId, { threadLocked: true })).toBe('Edit');
  });
});
