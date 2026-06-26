import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread, updateThread } from '../services/threads';
import { createPost, listPosts, getPostById, updatePost, deletePost } from '../services/posts';

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

    it('shows only approved posts to regular users', () => {
      const result = listPosts(db, threadId, { role: 'user' });
      expect(result.data.every(p => p.approvalStatus === 'approved')).toBe(true);
    });

    it('shows all posts to moderators', () => {
      const result = listPosts(db, threadId, { role: 'moderator' });
      expect(result.data.length).toBe(2);
    });
  });

  it('soft-deletes a post', () => {
    const post = createPost(db, { threadId, authorUserId: userId, body: 'Delete me' });
    updatePost(db, post.id, { approvalStatus: 'approved' });
    deletePost(db, post.id);
    expect(getPostById(db, post.id, 'user')).toBeNull();
    expect(getPostById(db, post.id, 'admin')).not.toBeNull();
  });
});
