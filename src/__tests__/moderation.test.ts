import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread } from '../services/threads';
import { createPost } from '../services/posts';
import { writeAuditLog, getAuditLog, approveThread, hideThread, approvePost, hidePost, getPendingApprovals } from '../services/moderation';

describe('Moderation service', () => {
  let db: ReturnType<typeof createTestDb>;
  let adminId: string;
  let threadId: string;
  let postId: string;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    db = createTestDb();
    const admin = await createUser(db, 'modadmin', 'mod@example.com', 'password123', 'admin');
    adminId = admin.id;
    const thread = createThread(db, { categoryId, authorUserId: adminId, title: 'Mod Thread', body: 'body' });
    threadId = thread.id;
    const post = createPost(db, { threadId, authorUserId: adminId, body: 'Mod Post' });
    postId = post.id;
  });

  describe('writeAuditLog', () => {
    it('writes an audit log entry', () => {
      const entry = writeAuditLog(db, {
        actorUserId: adminId,
        targetType: 'thread',
        targetId: threadId,
        action: 'approve',
        reason: 'Looks good',
      });
      expect(entry.id).toBeTruthy();
      expect(entry.action).toBe('approve');
      expect(entry.reason).toBe('Looks good');
    });
  });

  describe('getAuditLog', () => {
    it('retrieves paginated audit log with actor username', () => {
      writeAuditLog(db, { actorUserId: adminId, targetType: 'thread', targetId: threadId, action: 'test' });
      const result = getAuditLog(db);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].actorUsername).toBe('modadmin');
    });
  });

  describe('approveThread', () => {
    it('approves a new thread', () => {
      const result = approveThread(db, threadId, adminId, 'approved!');
      expect(result.success).toBe(true);
      const thread = db.prepare('SELECT approvalStatus FROM threads WHERE id = ?').get(threadId) as { approvalStatus: string };
      expect(thread.approvalStatus).toBe('approved');
    });

    it('returns error for non-existent thread', () => {
      const result = approveThread(db, 'non-existent', adminId);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('hideThread', () => {
    it('hides and unhides a thread', () => {
      hideThread(db, threadId, adminId, true, 'spam');
      const hidden = db.prepare('SELECT isHidden FROM threads WHERE id = ?').get(threadId) as { isHidden: number };
      expect(hidden.isHidden).toBe(1);

      hideThread(db, threadId, adminId, false);
      const unhidden = db.prepare('SELECT isHidden FROM threads WHERE id = ?').get(threadId) as { isHidden: number };
      expect(unhidden.isHidden).toBe(0);
    });
  });

  describe('approvePost / hidePost', () => {
    it('approves a post', () => {
      const result = approvePost(db, postId, adminId);
      expect(result.success).toBe(true);
    });

    it('hides a post', () => {
      hidePost(db, postId, adminId, true);
      const post = db.prepare('SELECT isHidden FROM posts WHERE id = ?').get(postId) as { isHidden: number };
      expect(post.isHidden).toBe(1);
    });
  });

  describe('getPendingApprovals', () => {
    it('returns correct pending counts', () => {
      const counts = getPendingApprovals(db);
      expect(counts.threads).toBeGreaterThanOrEqual(1); // our test thread is 'new'
      expect(counts.posts).toBeGreaterThanOrEqual(1);   // our test post is 'new'
    });
  });
});
