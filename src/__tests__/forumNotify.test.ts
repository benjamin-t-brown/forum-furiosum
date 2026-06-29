import { describe, it, expect } from 'vitest';
import {
  computePollWindow,
  formatEventDiscordMessages,
  parseNotifyEventTypes,
} from '../utils/forumNotify';
import type { NotificationEvent } from '../services/notificationEvents';

const sampleEvents: NotificationEvent[] = [
  {
    id: 'thread_created:thread-1',
    type: 'thread_created',
    occurredAt: '2026-01-01T00:00:00.000Z',
    threadId: 'thread-1',
    title: 'Hello',
    categoryId: 'cat-1',
    categoryName: 'General',
    authorUserId: 'user-1',
    authorUsername: 'alice',
  },
  {
    id: 'approval_required:post:post-1',
    type: 'approval_required',
    kind: 'post',
    occurredAt: '2026-01-01T00:01:00.000Z',
    postId: 'post-1',
    threadId: 'thread-2',
    threadTitle: 'Other thread',
    authorUserId: 'user-2',
    authorUsername: 'bob',
  },
];

describe('forumNotify', () => {
  describe('parseNotifyEventTypes', () => {
    it('returns undefined for empty input', () => {
      expect(parseNotifyEventTypes(undefined)).toBeUndefined();
      expect(parseNotifyEventTypes('   ')).toBeUndefined();
    });

    it('parses valid event types', () => {
      expect(parseNotifyEventTypes('approval_required,comment_created')).toEqual([
        'approval_required',
        'comment_created',
      ]);
    });

    it('rejects invalid event types', () => {
      expect(() => parseNotifyEventTypes('not_real')).toThrow(/Invalid NOTIFY_EVENT_TYPES/);
    });
  });

  describe('computePollWindow', () => {
    it('uses the saved watermark when one exists', () => {
      const now = new Date('2026-06-27T12:00:00.000Z');
      const window = computePollWindow({
        now,
        lastUntil: '2026-06-27T11:55:00.000Z',
      });

      expect(window).toEqual({
        since: '2026-06-27T11:55:00.000Z',
        until: '2026-06-27T12:00:00.000Z',
      });
    });

    it('looks back one day on the first run by default', () => {
      const now = new Date('2026-06-27T12:00:00.000Z');
      const window = computePollWindow({
        now,
        lastUntil: null,
      });

      expect(window.since).toBe('2026-06-26T12:00:00.000Z');
      expect(window.until).toBe('2026-06-27T12:00:00.000Z');
    });

    it('supports a custom first-run lookback', () => {
      const now = new Date('2026-06-27T12:00:00.000Z');
      const window = computePollWindow({
        now,
        lastUntil: null,
        initialLookbackMinutes: 30,
      });

      expect(window.since).toBe('2026-06-27T11:30:00.000Z');
      expect(window.until).toBe('2026-06-27T12:00:00.000Z');
    });
  });

  describe('formatEventDiscordMessages', () => {
    it('returns no messages when there are no events', () => {
      expect(formatEventDiscordMessages([], 'https://forum.example.com')).toEqual([]);
    });

    it('formats post edited embeds with editor details', () => {
      const messages = formatEventDiscordMessages([{
        id: 'post_edited:post-1:2026-01-01T01:00:00.000Z',
        type: 'post_edited',
        occurredAt: '2026-01-01T01:00:00.000Z',
        postId: 'post-1',
        threadId: 'thread-1',
        threadTitle: 'Hello',
        authorUserId: 'user-1',
        authorUsername: 'alice',
        editorUserId: 'user-2',
        editorUsername: 'admin',
      }], 'https://forum.example.com');

      expect(messages[0].embeds![0]).toMatchObject({
        title: 'Reply edited in "Hello"',
        description: 'Originally by **alice**, edited by **admin**',
        url: 'https://forum.example.com/threads/thread-1#post-post-1',
        footer: { text: 'post_edited:post-1:2026-01-01T01:00:00.000Z' },
      });
    });

    it('formats delete and username change embeds', () => {
      const messages = formatEventDiscordMessages([
        {
          id: 'post_deleted:audit-1',
          type: 'post_deleted',
          occurredAt: '2026-01-01T01:00:00.000Z',
          auditLogId: 'audit-1',
          postId: 'post-1',
          threadId: 'thread-1',
          threadTitle: 'Hello',
          authorUserId: 'user-1',
          authorUsername: 'alice',
          initiatedByUserId: 'user-2',
          initiatedByUsername: 'admin',
          reason: 'Spam',
          postBodyPreview: 'This is the deleted reply.',
        },
        {
          id: 'thread_deleted:audit-2',
          type: 'thread_deleted',
          occurredAt: '2026-01-01T02:00:00.000Z',
          auditLogId: 'audit-2',
          threadId: 'thread-2',
          title: 'Gone thread',
          categoryId: 'cat-1',
          categoryName: 'General',
          authorUserId: 'user-1',
          authorUsername: 'alice',
          initiatedByUserId: 'user-2',
          initiatedByUsername: 'admin',
          reason: 'Off-topic',
        },
        {
          id: 'username_changed:audit-3',
          type: 'username_changed',
          occurredAt: '2026-01-01T03:00:00.000Z',
          auditLogId: 'audit-3',
          userId: 'user-1',
          username: 'alice2',
          previousUsername: 'alice',
          initiatedByUserId: 'user-2',
          initiatedByUsername: 'admin',
          reason: 'Changed username from alice to alice2',
        },
      ], 'https://forum.example.com');

      expect(messages[0].embeds![0]).toMatchObject({
        title: 'Reply deleted in "Hello"',
        description: 'Initiated by **admin**',
        url: 'https://forum.example.com/admin/posts/post-1/edit',
        fields: [
          { name: 'Author', value: 'alice' },
          { name: 'Thread', value: 'Hello', inline: false },
          { name: 'Excerpt', value: 'This is the deleted reply.', inline: false },
          { name: 'Reason', value: 'Spam', inline: false },
        ],
      });
      expect(messages[0].embeds![1]).toMatchObject({
        title: 'Thread deleted: Gone thread',
        description: 'Initiated by **admin**',
        fields: [
          { name: 'Author', value: 'alice' },
          { name: 'Category', value: 'General' },
          { name: 'Reason', value: 'Off-topic', inline: false },
        ],
      });
      expect(messages[0].embeds![2]).toMatchObject({
        title: 'Username changed: alice2',
        description: 'Initiated by **admin**',
        fields: [
          { name: 'Previous', value: 'alice' },
          { name: 'New', value: 'alice2' },
          { name: 'Reason', value: 'Changed username from alice to alice2', inline: false },
        ],
      });
    });

    it('formats embeds with forum links and event ids', () => {
      const messages = formatEventDiscordMessages(sampleEvents, 'https://forum.example.com', {
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-01-02T00:00:00.000Z',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('**2 forum events** between');
      expect(messages[0].embeds).toHaveLength(2);
      expect(messages[0].embeds![0]).toMatchObject({
        title: 'New thread: Hello',
        url: 'https://forum.example.com/threads/thread-1',
        footer: { text: 'thread_created:thread-1' },
      });
      expect(messages[0].embeds![1]).toMatchObject({
        title: 'Reply needs approval in "Other thread"',
        url: 'https://forum.example.com/admin/posts/post-1/edit',
        footer: { text: 'approval_required:post:post-1' },
      });
    });
  });
});
