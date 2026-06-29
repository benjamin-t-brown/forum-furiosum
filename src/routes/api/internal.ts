import { Router } from 'express';
import { getDb } from '../../db/db';
import { listPendingApprovalDetails } from '../../services/moderation';
import {
  listNotificationEvents,
  type NotificationEventType,
} from '../../services/notificationEvents';
import { requireModerationPollSecret } from '../../middleware/requireModerationPollSecret';
import { ok, fail } from './helpers';

export const internalRouter = Router();

const EVENT_TYPES: NotificationEventType[] = [
  'thread_created',
  'comment_created',
  'post_edited',
  'post_deleted',
  'thread_deleted',
  'approval_required',
  'user_created',
  'user_role_changed',
  'username_changed',
];

function parseIsoDate(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {return null;}
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {return null;}
  return trimmed;
}

function parseEventTypes(value: string | undefined): NotificationEventType[] | undefined | null {
  if (!value?.trim()) {return undefined;}
  const requested = value.split(',').map((part) => part.trim()).filter(Boolean);
  const invalid = requested.filter((type) => !EVENT_TYPES.includes(type as NotificationEventType));
  if (invalid.length > 0) {return null;}
  return requested as NotificationEventType[];
}

// GET /api/v1/internal/pending — secret-protected queue snapshot for external pollers
internalRouter.get('/pending', requireModerationPollSecret, (_req, res) => {
  const db = getDb();
  ok(res, listPendingApprovalDetails(db));
});

// GET /api/v1/internal/events?since=...&until=...&types=...&limit=...
internalRouter.get('/events', requireModerationPollSecret, (req, res) => {
  const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
  const since = parseIsoDate(sinceRaw, 'since');
  if (!since) {
    fail(res, 400, 'BAD_REQUEST', 'Query parameter "since" is required and must be a valid ISO date/time');
    return;
  }

  const untilRaw = typeof req.query.until === 'string' ? req.query.until : new Date().toISOString();
  const until = parseIsoDate(untilRaw, 'until');
  if (!until) {
    fail(res, 400, 'BAD_REQUEST', 'Query parameter "until" must be a valid ISO date/time');
    return;
  }

  if (since >= until) {
    fail(res, 400, 'BAD_REQUEST', '"since" must be earlier than "until"');
    return;
  }

  const types = parseEventTypes(typeof req.query.types === 'string' ? req.query.types : undefined);
  if (types === null) {
    fail(res, 400, 'BAD_REQUEST', `Invalid "types" value. Allowed: ${EVENT_TYPES.join(', ')}`);
    return;
  }

  const limit = typeof req.query.limit === 'string'
    ? parseInt(req.query.limit, 10)
    : undefined;

  const db = getDb();
  ok(res, listNotificationEvents(db, { since, until, types, limit }));
});
