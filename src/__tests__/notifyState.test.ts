import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import {
  clearNotifyState,
  filterUnnotifiedEvents,
  loadNotifyLastUntil,
  recordNotifiedEvents,
  saveNotifyLastUntil,
} from '../services/notifyState';
import { computePollWindow } from '../utils/forumNotify';
import type { NotificationEvent } from '../services/notificationEvents';

const sampleEvents: NotificationEvent[] = [
  {
    id: 'comment_created:post-1',
    type: 'comment_created',
    occurredAt: '2026-01-01T00:00:00.000Z',
    postId: 'post-1',
    threadId: 'thread-1',
    threadTitle: 'Hello',
    authorUserId: 'user-1',
    authorUsername: 'alice',
  },
  {
    id: 'comment_created:post-2',
    type: 'comment_created',
    occurredAt: '2026-01-01T00:01:00.000Z',
    postId: 'post-2',
    threadId: 'thread-1',
    threadTitle: 'Hello',
    authorUserId: 'user-2',
    authorUsername: 'bob',
  },
];

describe('notifyState', () => {
  const db = createTestDb();

  beforeEach(() => {
    db.exec('DELETE FROM notified_events');
    db.exec("DELETE FROM notify_poll_state WHERE id = 'default'");
  });

  it('stores and loads the poll watermark', () => {
    expect(loadNotifyLastUntil(db)).toBeNull();
    saveNotifyLastUntil(db, '2026-06-27T12:00:00.000Z');
    expect(loadNotifyLastUntil(db)).toBe('2026-06-27T12:00:00.000Z');
  });

  it('filters out events that were already notified', () => {
    recordNotifiedEvents(db, ['comment_created:post-1']);
    expect(filterUnnotifiedEvents(db, sampleEvents)).toEqual([sampleEvents[1]]);
  });

  it('ignores duplicate notified event ids', () => {
    recordNotifiedEvents(db, ['comment_created:post-1', 'comment_created:post-1']);
    expect(filterUnnotifiedEvents(db, sampleEvents)).toEqual([sampleEvents[1]]);
  });

  it('clearNotifyState advances watermark and empties notified_events', () => {
    saveNotifyLastUntil(db, '2020-01-01T00:00:00.000Z');
    recordNotifiedEvents(db, ['comment_created:post-1']);

    const now = new Date('2026-06-28T12:00:00.000Z');
    const result = clearNotifyState(db, now);

    expect(result.lastUntil).toBe('2026-06-28T12:00:00.000Z');
    expect(result.clearedNotifiedCount).toBe(1);
    expect(loadNotifyLastUntil(db)).toBe('2026-06-28T12:00:00.000Z');
    expect(filterUnnotifiedEvents(db, sampleEvents)).toEqual(sampleEvents);

    const window = computePollWindow({ now, lastUntil: loadNotifyLastUntil(db) });
    expect(window.since).toBe('2026-06-28T12:00:00.000Z');
    expect(window.until).toBe('2026-06-28T12:00:00.000Z');
  });
});
