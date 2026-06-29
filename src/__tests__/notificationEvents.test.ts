import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser } from '../services/auth';
import { createThread } from '../services/threads';
import { createPost, resolveReplyApproval } from '../services/posts';
import { identifyEphemeralClient } from '../services/ephemeralUsers';
import { listNotificationEvents } from '../services/notificationEvents';
import { v4 as uuidv4 } from 'uuid';

describe('listNotificationEvents', () => {
  let db: ReturnType<typeof createTestDb>;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    db = createTestDb();
  });

  it('includes same-day posts when since/until are ISO and createdAt is SQLite datetime', async () => {
    const author = await createUser(db, 'notifyuser', 'notify@example.com', 'password123');
    const thread = createThread(db, {
      categoryId,
      authorUserId: author.id,
      title: 'Notify thread',
      body: 'body',
      approvalStatus: 'approved',
    });
    const post = createPost(db, {
      threadId: thread.id,
      authorUserId: author.id,
      body: 'Same-day reply',
      approvalStatus: 'approved',
    });
    db.prepare("UPDATE posts SET createdAt = '2026-06-29 15:05:00' WHERE id = ?").run(post.id);

    const result = listNotificationEvents(db, {
      since: '2026-06-29T15:00:00.000Z',
      until: '2026-06-29T16:00:00.000Z',
      types: ['comment_created'],
    });

    expect(result.events.some((event) => event.id === `comment_created:${post.id}`)).toBe(true);
  });

  it('includes auto-approved ephemeral replies as comment_created', async () => {
    const author = await createUser(db, 'author', 'author@example.com', 'password123', 'user', 'verified');
    const thread = createThread(db, {
      categoryId,
      authorUserId: author.id,
      title: 'Ephemeral thread',
      body: 'body',
      approvalStatus: 'approved',
      replyApprovalTrust: 'ephemeral',
    });

    const identified = await identifyEphemeralClient(db, uuidv4(), thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    const post = createPost(db, {
      threadId: thread.id,
      authorUserId: identified.user.id,
      body: 'Ephemeral reply',
      approvalStatus: resolveReplyApproval(identified.user.trust, thread.replyApprovalTrust, {
        isEphemeral: true,
      }),
    });
    db.prepare("UPDATE posts SET createdAt = '2026-06-29 16:10:00' WHERE id = ?").run(post.id);

    const result = listNotificationEvents(db, {
      since: '2026-06-29T16:00:00.000Z',
      until: '2026-06-29T17:00:00.000Z',
      types: ['comment_created'],
    });

    const event = result.events.find((item) => item.id === `comment_created:${post.id}`);
    expect(event).toMatchObject({
      type: 'comment_created',
      authorUsername: identified.user.username,
      threadTitle: 'Ephemeral thread',
    });
  });

  it('does not emit user_created for ephemeral accounts', async () => {
    const author = await createUser(db, 'author2', 'author2@example.com', 'password123', 'user', 'verified');
    const thread = createThread(db, {
      categoryId,
      authorUserId: author.id,
      title: 'Ephemeral thread',
      body: 'body',
      approvalStatus: 'approved',
      replyApprovalTrust: 'ephemeral',
    });

    const identified = await identifyEphemeralClient(db, uuidv4(), thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    db.prepare("UPDATE users SET createdAt = '2026-06-29 12:00:00' WHERE id = ?").run(identified.user.id);

    const result = listNotificationEvents(db, {
      since: '2026-06-29T11:00:00.000Z',
      until: '2026-06-29T13:00:00.000Z',
      types: ['user_created'],
    });

    expect(result.events.some((event) => event.id === `user_created:${identified.user.id}`)).toBe(false);
  });
});
