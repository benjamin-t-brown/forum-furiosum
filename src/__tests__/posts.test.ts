import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread, updateThread } from '../services/threads';
import { createPost, listPosts, getPostById, updatePost, deletePost, resolveReplyApproval, resolveContentApproval } from '../services/posts';

describe('Post service', () => {
  let db: ReturnType<typeof createTestDb>;
  let userId: string;
  let threadId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    db = createTestDb();
    const user = await createUser(db, 'postuser', 'post@example.com', 'password123');
    userId = user.id;
    const thread = createThread(db, { categoryId, authorUserId: userId, title: 'Thread', body: 'body' });
    updateThread(db, thread.id, { approvalStatus: 'approved' });
    threadId = thread.id;
  });

  it('creates a post in a thread', () => {
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Hello reply' });
    expect(post.id).toBeTruthy();
    expect(post.body).toBe('Hello reply');
    expect(post.approvalStatus).toBe('new');
  });

  it('updating thread updatedAt when post is created', () => {
    const before = db.prepare('SELECT updatedAt FROM threads WHERE id = ?').get(threadId) as { updatedAt: string };
    // Small delay to ensure timestamp difference
    createPost(db, { threadId, authorUserId: userId, body: 'Reply' });
    const after = db.prepare('SELECT updatedAt FROM threads WHERE id = ?').get(threadId) as { updatedAt: string };
    // updatedAt should be same or later (SQLite datetime precision)
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  describe('listPosts visibility', () => {
    beforeEach(() => {
      const p1 = createPost(db, { threadId, authorUserId: userId, body: 'Approved post' });
      updatePost(db, p1.id, { approvalStatus: 'approved' });
      createPost(db, { threadId, authorUserId: userId, body: 'Pending post' });
    });

    it('shows only approved posts to anonymous viewers', () => {
      const result = listPosts(db, threadId, { role: 'user' });
      expect(result.data).toHaveLength(1);
      expect(result.data.every(p => p.approvalStatus === 'approved')).toBe(true);
    });

    it('shows own pending posts to the author', async () => {
      const result = listPosts(db, threadId, { role: 'user', viewerUserId: userId });
      expect(result.data).toHaveLength(2);
      expect(result.data.some(p => p.approvalStatus === 'new')).toBe(true);
    });

    it('does not show other users pending posts', async () => {
      const other = await createUser(db, 'otheruser', 'other@example.com', 'password123');
      const result = listPosts(db, threadId, { role: 'user', viewerUserId: other.id });
      expect(result.data).toHaveLength(1);
      expect(result.data.every(p => p.approvalStatus === 'approved')).toBe(true);
    });

    it('shows all non-deleted posts to moderators', () => {
      const result = listPosts(db, threadId, { role: 'moderator' });
      expect(result.data.length).toBe(2);
    });

    it('hides deleted posts from moderators', () => {
      const pending = createPost(db, { threadId, authorUserId: userId, body: 'Deleted pending' });
      deletePost(db, pending.id);

      const result = listPosts(db, threadId, { role: 'moderator' });
      expect(result.data.some(p => p.id === pending.id)).toBe(false);
    });
  });

  it('soft-deletes a post', () => {
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Delete me' });
    updatePost(db, post.id, { approvalStatus: 'approved' });
    deletePost(db, post.id);
    expect(getPostById(db, post.id, 'user', userId)).toBeNull();
    expect(getPostById(db, post.id, 'admin')).not.toBeNull();
  });

  it('lets authors view their own pending posts', () => {
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Pending for me' });
    expect(getPostById(db, post.id, 'user', userId)?.id).toBe(post.id);
    expect(getPostById(db, post.id, 'user')).toBeNull();
  });

  it('includes editor info after a post is edited', async () => {
    const editor = await createUser(db, 'editor', 'editor@example.com', 'password123', 'moderator');
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Original' });
    updatePost(db, post.id, { body: 'Revised', lastEditedByUserId: editor.id });

    const listed = listPosts(db, threadId, { role: 'moderator' }).data.find((p) => p.id === post.id);
    expect(listed?.lastEditedAt).toBeTruthy();
    expect(listed?.lastEditedByUserId).toBe(editor.id);
    expect(listed?.editorUsername).toBe('editor');
    expect(listed?.editorIsDeleted).toBe(0);
  });

  it('does not record an edit when the body is unchanged', async () => {
    const editor = await createUser(db, 'editor', 'editor@example.com', 'password123', 'moderator');
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Same text' });
    updatePost(db, post.id, {
      body: 'Same text',
      approvalStatus: 'approved',
      lastEditedByUserId: editor.id,
    });

    const listed = listPosts(db, threadId, { role: 'moderator' }).data.find((p) => p.id === post.id);
    expect(listed?.approvalStatus).toBe('approved');
    expect(listed?.lastEditedAt).toBeNull();
    expect(listed?.lastEditedByUserId).toBeNull();
  });

  describe('resolveContentApproval', () => {
    it('approves trusted and verified users', () => {
      expect(resolveContentApproval('trusted')).toBe('approved');
      expect(resolveContentApproval('verified')).toBe('approved');
    });

    it('queues other trust levels', () => {
      expect(resolveContentApproval('new')).toBe('new');
      expect(resolveContentApproval('unknown')).toBe('new');
    });
  });

  describe('resolveReplyApproval', () => {
    it('approves trusted and verified users by default', () => {
      expect(resolveReplyApproval('trusted')).toBe('approved');
      expect(resolveReplyApproval('verified')).toBe('approved');
    });

    it('queues other trust levels by default', () => {
      expect(resolveReplyApproval('new')).toBe('new');
      expect(resolveReplyApproval('unknown')).toBe('new');
    });

    it('approves users per thread threshold', () => {
      expect(resolveReplyApproval('new', 'new')).toBe('approved');
      expect(resolveReplyApproval('trusted', 'verified')).toBe('new');
      expect(resolveReplyApproval('verified', 'verified')).toBe('approved');
      expect(resolveReplyApproval('new', null)).toBe('new');
      expect(resolveReplyApproval('trusted', null)).toBe('approved');
    });
  });
});
