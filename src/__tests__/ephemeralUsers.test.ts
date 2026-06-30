import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from './helpers/db';
import { createUser, loginUser } from '../services/auth';
import { createThread, updateThread } from '../services/threads';
import { createPost, resolveReplyApproval } from '../services/posts';
import { createSession } from '../services/session';
import {
  identifyEphemeralClient,
  upgradeEphemeralUser,
  cleanupInactiveEphemeralUsers,
  canEphemeralUserPostToThread,
} from '../services/ephemeralUsers';
import { generateEphemeralUsername } from '../utils/ephemeralUsername';
import {
  parseReplyApprovalTrust,
  replyApprovalTrustSelectValue,
  REPLY_APPROVAL_TRUST_OPTIONS,
  allowsEphemeralReplies,
} from '../utils/replyApprovalTrust';

describe('ephemeral users', () => {
  let db: ReturnType<typeof createTestDb>;
  const categoryId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    db = createTestDb();
  });

  async function createEphemeralThread() {
    const author = await createUser(db, 'author', 'author@example.com', 'password123', 'user', 'verified');
    const thread = createThread(db, {
      categoryId,
      authorUserId: author.id,
      title: 'Ephemeral thread',
      body: 'body',
      approvalStatus: 'approved',
      replyApprovalTrust: 'ephemeral',
    });
    return thread;
  }

  it('identify creates user and session; reuses on second call', async () => {
    const thread = await createEphemeralThread();
    const clientId = uuidv4();

    const first = await identifyEphemeralClient(db, clientId, thread.id);
    expect(first.ok).toBe(true);
    if (!first.ok) {return;}
    expect(first.isNew).toBe(true);
    expect(first.user.isEphemeral).toBe(1);
    expect(first.user.username).toMatch(/^[a-z0-9]+_[a-z0-9]+_\d+$/);

    const second = await identifyEphemeralClient(db, clientId, thread.id);
    expect(second.ok).toBe(true);
    if (!second.ok) {return;}
    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('rejects identify when thread does not allow ephemeral', async () => {
    const author = await createUser(db, 'author2', 'author2@example.com', 'password123');
    const thread = createThread(db, {
      categoryId,
      authorUserId: author.id,
      title: 'Normal',
      body: 'body',
      approvalStatus: 'approved',
      replyApprovalTrust: 'new',
    });

    const result = await identifyEphemeralClient(db, uuidv4(), thread.id);
    expect(result.ok).toBe(false);
    if (result.ok) {return;}
    expect(result.code).toBe('FORBIDDEN');
  });

  it('auto-approves replies on ephemeral threads', async () => {
    expect(resolveReplyApproval('unknown', 'ephemeral', { isEphemeral: true })).toBe('approved');
    expect(resolveReplyApproval('new', 'ephemeral', { isEphemeral: false })).toBe('approved');
  });

  it('blocks ephemeral users from posting on non-ephemeral threads', () => {
    expect(canEphemeralUserPostToThread('new', { isEphemeral: 1 })).toBe(false);
    expect(canEphemeralUserPostToThread('ephemeral', { isEphemeral: 1 })).toBe(true);
    expect(canEphemeralUserPostToThread('new', { isEphemeral: 0 })).toBe(true);
  });

  it('rejects ephemeral identify after account upgrade', async () => {
    const thread = await createEphemeralThread();
    const clientId = uuidv4();
    const identified = await identifyEphemeralClient(db, clientId, thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    await upgradeEphemeralUser(
      db,
      identified.user.id,
      'realuser',
      'real@example.com',
      'password12345'
    );

    const again = await identifyEphemeralClient(db, clientId, thread.id);
    expect(again.ok).toBe(false);
    if (again.ok) {return;}
    expect(again.code).toBe('UPGRADED');
  });

  it('upgrade preserves user id for posts', async () => {
    const thread = await createEphemeralThread();
    const clientId = uuidv4();
    const identified = await identifyEphemeralClient(db, clientId, thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    createPost(db, {
      threadId: thread.id,
      authorUserId: identified.user.id,
      body: 'ephemeral post',
      approvalStatus: 'approved',
    });

    const upgraded = await upgradeEphemeralUser(
      db,
      identified.user.id,
      'realuser',
      'real@example.com',
      'password12345'
    );
    expect(upgraded?.id).toBe(identified.user.id);
    expect(upgraded?.isEphemeral).toBe(0);

    const posts = db.prepare('SELECT authorUserId FROM posts WHERE threadId = ?').all(thread.id) as { authorUserId: string }[];
    expect(posts[0].authorUserId).toBe(upgraded!.id);
  });

  it('login replaces session without moving ephemeral posts', async () => {
    const thread = await createEphemeralThread();
    const clientId = uuidv4();
    const identified = await identifyEphemeralClient(db, clientId, thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    createPost(db, {
      threadId: thread.id,
      authorUserId: identified.user.id,
      body: 'stays here',
      approvalStatus: 'approved',
    });

    await createUser(db, 'otheruser', 'other@example.com', 'password12345');
    const loggedIn = await loginUser(db, 'other@example.com', 'password12345');
    expect(loggedIn).not.toBeNull();
    createSession(db, loggedIn!.id);

    const posts = db.prepare('SELECT authorUserId FROM posts WHERE threadId = ?').all(thread.id) as { authorUserId: string }[];
    expect(posts[0].authorUserId).toBe(identified.user.id);
    expect(posts[0].authorUserId).not.toBe(loggedIn!.id);
  });

  it('generates unique adjective and noun per day in batch', () => {
    const adjectives = new Set<string>();
    const nouns = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const username = generateEphemeralUsername(db);
      expect(username).toMatch(/^[a-z0-9]+_[a-z0-9]+_\d{1,3}$/);
      const parts = username.split('_');
      adjectives.add(parts[0]);
      nouns.add(parts[1]);
    }
    expect(adjectives.size).toBe(50);
    expect(nouns.size).toBe(50);
  });

  it('cleans up inactive ephemeral users', async () => {
    const thread = await createEphemeralThread();
    const clientId = uuidv4();
    const identified = await identifyEphemeralClient(db, clientId, thread.id);
    expect(identified.ok).toBe(true);
    if (!identified.ok) {return;}

    db.prepare("UPDATE users SET lastActivityAt = datetime('now', '-8 days') WHERE id = ?").run(identified.user.id);

    const cleaned = await cleanupInactiveEphemeralUsers(db, 7);
    expect(cleaned).toBe(1);

    const row = db.prepare('SELECT isDeleted FROM users WHERE id = ?').get(identified.user.id) as { isDeleted: number };
    expect(row.isDeleted).toBe(1);
  });
});

describe('replyApprovalTrust ephemeral option', () => {
  it('parses ephemeral and maps select value', () => {
    expect(parseReplyApprovalTrust('ephemeral')).toBe('ephemeral');
    expect(replyApprovalTrustSelectValue('ephemeral')).toBe('ephemeral');
    expect(allowsEphemeralReplies('ephemeral')).toBe(true);
  });

  it('renamed any logged in label', () => {
    const anyLoggedIn = REPLY_APPROVAL_TRUST_OPTIONS.find((o) => o.value === 'new');
    expect(anyLoggedIn?.label).toBe('Any logged in');
  });
});
