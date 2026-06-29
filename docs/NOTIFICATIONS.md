# Discord notifications

An optional notify job polls the forum for new activity and posts alerts to a Discord channel via a bot. The web server does not talk to Discord itself — it only exposes secret-protected internal API endpoints.

---

## Forum configuration

Set `MODERATION_POLL_SECRET` in `.env` (or your Docker `--env-file`) to a long random string. This enables:

```
GET /api/v1/internal/pending
Authorization: Bearer <MODERATION_POLL_SECRET>
```

The response includes pending threads, posts, and username-change requests (with IDs). If the secret is unset, the endpoint returns 404.

For a broader event feed (new threads, comments, approvals needed, signups, role changes), use:

```
GET /api/v1/internal/events?since=2026-06-01T00:00:00.000Z&until=2026-06-27T23:59:59.999Z
Authorization: Bearer <MODERATION_POLL_SECRET>
```

Query parameters:

| Parameter | Required | Description |
|---|---|---|
| `since` | Yes | ISO date/time (inclusive start of range) |
| `until` | No | ISO date/time (exclusive end; defaults to now) |
| `types` | No | Comma-separated filter: `thread_created`, `comment_created`, `post_edited`, `post_deleted`, `thread_deleted`, `approval_required`, `user_created`, `user_role_changed`, `username_changed` |
| `limit` | No | Max events returned (default 500, max 2000) |

Each event has a stable `id`, a `type`, an `occurredAt` timestamp, and type-specific fields (thread/post/user IDs, titles, usernames, etc.). Events are sorted oldest-first.

Example:

```bash
curl -s -H "Authorization: Bearer $MODERATION_POLL_SECRET" \
  "$FORUM_BASE_URL/api/v1/internal/events?since=2026-06-01T00:00:00.000Z" \
  | jq '.data.events[] | {id, type, occurredAt}'
```

---

## Notify script

`scripts/notify.ts` (dev) / `node dist/notify.js` (production) polls `GET /api/v1/internal/events` and posts new forum activity to Discord. Run it on a schedule (cron, systemd timer, etc.).

Notify state is stored in the same SQLite database as the forum:

| Table | Purpose |
|---|---|
| `notify_poll_state` | Poll watermark (`lastUntil`) |
| `notified_events` | Event IDs already posted to Discord |

On the first run it looks back 1 day by default (`NOTIFY_INITIAL_LOOKBACK_MINUTES=1440`). Each later run requests events from the saved watermark through the current time. Already-notified events are skipped using stable event IDs in `notified_events` (for example `comment_created:<post-id>`). Each Discord embed includes that ID in its footer.

### Environment variables

Add these to the same env file used by Docker (`--env-file`) or local `.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `MODERATION_POLL_SECRET` | Yes | — | Same secret as on the forum (enables the internal API) |
| `FORUM_BASE_URL` | Yes | — | Public forum URL (e.g. `https://example.com/forum-furiosum`) |
| `DISCORD_BOT_TOKEN` | Yes* | — | Bot token from the Developer Portal (*not required with `--dry-run`) |
| `DISCORD_CHANNEL_ID` | Yes* | — | Channel ID where alerts should be posted |
| `DB_PATH` | Yes | `./forum.sqlite` | Same database as the web app |
| `NOTIFY_EVENT_TYPES` | No | all types | Comma-separated event filter |
| `NOTIFY_INITIAL_LOOKBACK_MINUTES` | No | `1440` | First-run lookback window (1 day) |
| `NOTIFY_PRUNE_DAYS` | No | `90` | Drop `notified_events` rows older than N days after each successful run |

When served under a subpath, set `BASE_PATH` on the forum and use the full public URL for `FORUM_BASE_URL` (see [DEPLOYMENT.md — Reverse proxy](DEPLOYMENT.md#reverse-proxy-subpath)).

### Discord setup

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open **Bot** → **Reset Token** and copy the token (`DISCORD_BOT_TOKEN`).
3. Under **Privileged Gateway Intents**, you do not need any intents for this script (it uses the REST API only).
4. Open **OAuth2 → URL Generator**, select scopes `bot`, and permissions **Send Messages** and **Embed Links**.
5. Open the generated invite URL, add the bot to your server, then copy the target channel ID (`DISCORD_CHANNEL_ID`; enable Developer Mode in Discord settings, then right-click the channel → **Copy Channel ID**).

### Run manually

`--dry-run` prints the Discord payload without posting or updating notify state:

```bash
npm run notify -- --dry-run
npm run notify
npm run notify -- --types=approval_required,comment_created
npm run notify -- --help
```

Production (after `npm run prod` or a Docker build):

```bash
npm run notify:prod
npm run notify:prod -- --dry-run
```

**Docker** — notify inherits the container's `--env-file` variables:

```bash
docker exec forum-furiosum node dist/notify.js
docker exec forum-furiosum node dist/notify.js --dry-run
```

Local wrapper:

```bash
./scripts/notify.local.sh --dry-run
```

### Cron

Host (from repo checkout):

```cron
*/5 * * * * cd /path/to/forum-furiosum && npm run notify >> /var/log/forum-notify.log 2>&1
```

Docker:

```bash
./scripts/notify.docker.sh
```

```cron
*/5 * * * * /path/to/forum-furiosum/scripts/notify.docker.sh >> /var/log/forum-notify.log 2>&1
```

### Reset notification state

**Skip all pending Discord notifications** (does not post to Discord; next notify run sees only new activity after this moment):

```bash
npm run notify:clear
# production / Docker (after build):
node dist/clear-notify-state.js
```

This sets `notify_poll_state.lastUntil` to the current time and clears `notified_events`. The next `npm run notify` (or `--dry-run`) polls an empty window and posts nothing unless new forum events occur afterward.

Manual SQL (same effect as `notify:clear`):

```sql
-- Inspect
SELECT * FROM notify_poll_state;
SELECT eventId, notifiedAt FROM notified_events ORDER BY notifiedAt DESC LIMIT 20;

-- Full reset (next run behaves like first run — replays lookback window; may send Discord)
DELETE FROM notified_events;
DELETE FROM notify_poll_state WHERE id = 'default';

-- Replay one event
DELETE FROM notified_events WHERE eventId = 'comment_created:YOUR-POST-UUID';
```

Use `--types` or `NOTIFY_EVENT_TYPES` to limit which events trigger Discord messages without resetting state.
