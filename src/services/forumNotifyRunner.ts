import type Database from 'better-sqlite3';
import { getDb } from '../db/db';
import { runMigrations } from '../db/migrations';
import type { NotificationEventType } from './notificationEvents';
import type { NotificationEventsResult } from './notificationEvents';
import {
  filterUnnotifiedEvents,
  loadNotifyLastUntil,
  pruneNotifiedEvents,
  recordNotifiedEvents,
  saveNotifyLastUntil,
} from './notifyState';
import {
  computePollWindow,
  formatEventDiscordMessages,
  parseNotifyEventTypes,
  forumNotifyDefaults,
  type DiscordMessagePayload,
} from '../utils/forumNotify';

interface EventsApiResponse {
  ok: boolean;
  data?: NotificationEventsResult;
  error?: { code: string; message: string };
}

export interface NotifyRunOptions {
  db: Database.Database;
  forumBaseUrl: string;
  secret: string;
  discordBotToken?: string;
  discordChannelId?: string;
  eventTypes?: NotificationEventType[];
  initialLookbackMinutes?: number;
  pruneDays?: number;
  dryRun?: boolean;
  now?: Date;
}

export interface NotifyRunResult {
  notified: boolean;
  eventCount: number;
  newEventCount: number;
  since: string;
  until: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {return fallback;}
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseNotifyArgs(argv: string[]): {
  dryRun: boolean;
  help: boolean;
  eventTypes?: NotificationEventType[];
} {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { dryRun: false, help: true };
  }

  let eventTypes: NotificationEventType[] | undefined;
  for (const arg of argv) {
    if (arg === '--dry-run') {continue;}
    if (arg.startsWith('--types=')) {
      eventTypes = parseNotifyEventTypes(arg.slice('--types='.length));
    }
  }

  return {
    dryRun: argv.includes('--dry-run'),
    help: false,
    eventTypes,
  };
}

export function printNotifyHelp(): void {
  console.log(`Forum Furiosum notification script

Polls GET /api/v1/internal/events and posts new activity to Discord.
Designed to run on a schedule (cron, systemd timer, etc.).

Usage:
  npm run notify [-- --dry-run] [-- --types=approval_required,comment_created]

Options:
  --dry-run           Print Discord payloads without posting
  --types=<list>      Comma-separated event types (overrides NOTIFY_EVENT_TYPES)
  --help, -h          Show this help

Environment:
  FORUM_BASE_URL                   Forum origin (required)
  MODERATION_POLL_SECRET           Internal API secret (required)
  DB_PATH                          SQLite database path (default: ./forum.sqlite)
  DISCORD_BOT_TOKEN                Discord bot token (required unless --dry-run)
  DISCORD_CHANNEL_ID               Discord channel ID (required unless --dry-run)
  NOTIFY_EVENT_TYPES               Optional comma-separated event filter
  NOTIFY_INITIAL_LOOKBACK_MINUTES  First-run lookback window (default: 1440 / 1 day)
  NOTIFY_PRUNE_DAYS                Drop notified-event rows older than N days (default: 90)

Example cron (every 5 minutes):
  */5 * * * * cd /path/to/forum-furiosum && npm run notify >> /var/log/forum-notify.log 2>&1

Docker (production image):
  docker exec forum-furiosum node dist/notify.js
  ./scripts/notify.docker.sh
`);
}

async function fetchNotificationEvents(options: {
  forumBaseUrl: string;
  secret: string;
  since: string;
  until: string;
  eventTypes?: NotificationEventType[];
}): Promise<NotificationEventsResult> {
  const params = new URLSearchParams({
    since: options.since,
    until: options.until,
  });
  if (options.eventTypes?.length) {
    params.set('types', options.eventTypes.join(','));
  }

  const url = `${options.forumBaseUrl.replace(/\/$/, '')}/api/v1/internal/events?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${options.secret}` },
  });

  const body = (await response.json()) as EventsApiResponse;
  if (!response.ok || !body.ok || !body.data) {
    const message = body.error?.message ?? `HTTP ${response.status}`;
    let hint = '';
    if (response.status === 404) {
      hint = ' Check that the forum is running, FORUM_BASE_URL is correct, and MODERATION_POLL_SECRET is set in the forum .env (then restart the server).';
    } else if (response.status === 401) {
      hint = ' Check that MODERATION_POLL_SECRET matches between the notify script and the forum .env.';
    }
    throw new Error(`Failed to fetch notification events: ${message}${hint}`);
  }

  return body.data;
}

async function sendDiscordMessages(options: {
  botToken: string;
  channelId: string;
  messages: DiscordMessagePayload[];
}): Promise<void> {
  for (const message of options.messages) {
    const response = await fetch(`https://discord.com/api/v10/channels/${options.channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${options.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Discord API error ${response.status}: ${body}`);
    }
  }
}

export async function runForumNotify(options: NotifyRunOptions): Promise<NotifyRunResult> {
  const now = options.now ?? new Date();
  const lastUntil = loadNotifyLastUntil(options.db);
  const { since, until } = computePollWindow({
    now,
    lastUntil,
    initialLookbackMinutes: options.initialLookbackMinutes,
  });

  const data = await fetchNotificationEvents({
    forumBaseUrl: options.forumBaseUrl,
    secret: options.secret,
    since,
    until,
    eventTypes: options.eventTypes,
  });

  const newEvents = filterUnnotifiedEvents(options.db, data.events);

  if (newEvents.length === 0) {
    if (!options.dryRun) {
      saveNotifyLastUntil(options.db, until);
      if (data.events.length > 0) {
        console.log(`Polled ${since} → ${until}; ${data.events.length} event(s) already notified (watermark advanced).`);
      } else {
        console.log(`Polled ${since} → ${until}; no events (watermark advanced).`);
      }
    } else if (data.events.length > 0) {
      console.log(`[dry-run] Polled ${since} → ${until}; ${data.events.length} event(s) already notified (state not updated).`);
    } else {
      console.log(`[dry-run] Polled ${since} → ${until}; no events (state not updated).`);
    }
    return { notified: false, eventCount: data.events.length, newEventCount: 0, since, until };
  }

  const messages = formatEventDiscordMessages(newEvents, options.forumBaseUrl, { since, until });

  if (options.dryRun) {
    console.log(`[dry-run] Polled ${since} → ${until} (${newEvents.length} new of ${data.events.length} event(s); state not updated)`);
    console.log(`[dry-run] Would post ${messages.length} Discord message(s):`);
    console.log(JSON.stringify(messages, null, 2));
  } else {
    const botToken = options.discordBotToken ?? requireEnv('DISCORD_BOT_TOKEN');
    const channelId = options.discordChannelId ?? requireEnv('DISCORD_CHANNEL_ID');
    await sendDiscordMessages({ botToken, channelId, messages });
    recordNotifiedEvents(options.db, newEvents.map((event) => event.id));
    saveNotifyLastUntil(options.db, until);
    const pruned = pruneNotifiedEvents(options.db, options.pruneDays);
    if (pruned > 0) {
      console.log(`Pruned ${pruned} notified event record(s) older than ${options.pruneDays ?? 90} days.`);
    }
    console.log(`Polled ${since} → ${until}; posted ${messages.length} Discord message(s) for ${newEvents.length} new event(s).`);
  }

  return {
    notified: !options.dryRun,
    eventCount: data.events.length,
    newEventCount: newEvents.length,
    since,
    until,
  };
}

export async function runForumNotifyFromEnv(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { dryRun, help, eventTypes: cliEventTypes } = parseNotifyArgs(argv);
  if (help) {
    printNotifyHelp();
    return;
  }

  const db = getDb();
  runMigrations(db);

  const forumBaseUrl = requireEnv('FORUM_BASE_URL');
  const secret = requireEnv('MODERATION_POLL_SECRET');
  const eventTypes = cliEventTypes ?? parseNotifyEventTypes(process.env.NOTIFY_EVENT_TYPES);
  const initialLookbackMinutes = parsePositiveInt(
    process.env.NOTIFY_INITIAL_LOOKBACK_MINUTES,
    forumNotifyDefaults.DEFAULT_INITIAL_LOOKBACK_MINUTES
  );
  const pruneDays = parsePositiveInt(process.env.NOTIFY_PRUNE_DAYS, 90);

  await runForumNotify({
    db,
    forumBaseUrl,
    secret,
    eventTypes,
    initialLookbackMinutes,
    pruneDays,
    dryRun,
  });
}
