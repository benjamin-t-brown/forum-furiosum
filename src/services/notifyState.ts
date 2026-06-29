import Database from 'better-sqlite3';
import type { NotificationEvent } from './notificationEvents';

const POLL_STATE_ID = 'default';
const DEFAULT_PRUNE_DAYS = 90;

export function loadNotifyLastUntil(db: Database.Database): string | null {
  const row = db.prepare(
    'SELECT lastUntil FROM notify_poll_state WHERE id = ?'
  ).get(POLL_STATE_ID) as { lastUntil: string } | undefined;
  return row?.lastUntil ?? null;
}

export function saveNotifyLastUntil(db: Database.Database, lastUntil: string): void {
  db.prepare(`
    INSERT INTO notify_poll_state (id, lastUntil, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      lastUntil = excluded.lastUntil,
      updatedAt = datetime('now')
  `).run(POLL_STATE_ID, lastUntil);
}

export function filterUnnotifiedEvents(
  db: Database.Database,
  events: NotificationEvent[]
): NotificationEvent[] {
  if (events.length === 0) {return [];}

  const ids = events.map((event) => event.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT eventId FROM notified_events WHERE eventId IN (${placeholders})`
  ).all(...ids) as { eventId: string }[];
  const notified = new Set(rows.map((row) => row.eventId));
  return events.filter((event) => !notified.has(event.id));
}

export function recordNotifiedEvents(db: Database.Database, eventIds: string[]): void {
  if (eventIds.length === 0) {return;}

  const insert = db.prepare('INSERT OR IGNORE INTO notified_events (eventId) VALUES (?)');
  const record = db.transaction((ids: string[]) => {
    for (const id of ids) {
      insert.run(id);
    }
  });
  record(eventIds);
}

export function pruneNotifiedEvents(db: Database.Database, keepDays = DEFAULT_PRUNE_DAYS): number {
  const result = db.prepare(`
    DELETE FROM notified_events
    WHERE notifiedAt < datetime('now', ?)
  `).run(`-${keepDays} days`);
  return result.changes;
}

/** Skip all backlog: advance watermark to now and clear notified-event records. Does not call Discord. */
export function clearNotifyState(db: Database.Database, now = new Date()): { lastUntil: string; clearedNotifiedCount: number } {
  const lastUntil = now.toISOString();
  const clearedNotifiedCount = db.prepare('DELETE FROM notified_events').run().changes;
  saveNotifyLastUntil(db, lastUntil);
  return { lastUntil, clearedNotifiedCount };
}
