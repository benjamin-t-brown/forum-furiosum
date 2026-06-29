# Forum Furiosum

A simple, old-school web forum. Built with Node.js + TypeScript + Express + EJS + SQLite.

## Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (compiled with `tsc`, or run directly with `tsx` in dev)
- **Web framework**: Express
- **Templating**: EJS
- **Database**: SQLite via `better-sqlite3`
- **Auth**: Argon2id password hashing, server-side sessions
- **Port**: 9827

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 11.17+ (pinned via Corepack — see [Adding and updating dependencies](ADD_UPDATE_DEPS.md))

### Setup

```bash
# Clone and install dependencies
npm install
```

For dependency policy, version pinning, and install-script allowlists, see [ADD_UPDATE_DEPS.md](ADD_UPDATE_DEPS.md).

```bash
# Copy env file and edit it
cp .env.example .env
# Edit .env — at minimum set SESSION_SECRET and DB_PATH
```

### Run (dev mode)

```bash
npm run start
```

This runs `tsx src/index.ts` directly — no build step required. The server starts at [http://localhost:9827](http://localhost:9827).

On first run, an admin account is bootstrapped:
- **Development default**: `admin@admin.com` / `test12345`
- **Production**: set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in `.env`

### Lint

```bash
npm run lint        # check
npm run lint:fix    # auto-fix
```

### Tests

```bash
npm run test        # run all tests with vitest
```

Tests use an in-memory SQLite database — no setup needed.

---

## Production Build

```bash
npm run prod
```

This compiles TypeScript with `tsc` then runs `node dist/index.js`.

---

## Deployment

Docker build, push to AWS ECR, server setup, env vars, and nginx subpath config: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Discord notify cron (uses the same container): **[NOTIFICATIONS.md](NOTIFICATIONS.md)**.

---

## Embeddable comment threads

A thread can be embedded at the bottom of external pages (blog posts, announcements) as a comment thread iframe.

### Enable embedding

1. Open **Admin → Review Thread** for the thread you want to embed.
2. Check **Allow embedding**.
3. Save changes, then copy the iframe snippet shown on that page.

Example:

```html
<iframe src="https://your-forum.example.com/embed/threads/THREAD_ID" width="100%" height="480" style="border:16" title="Comments"></iframe>
```

Preview the embed at `/embed/threads/THREAD_ID`.

### Behavior

- **Public read access** — anyone can view approved comments; the thread opening post is hidden in the embed.
- **Login required to post** — users can compose a comment first; login/register opens in a popup so the draft is preserved in `localStorage`.
- **Cross-site auth** — login runs in a first-party popup on the forum domain (required for modern browser cookie rules).
- **Moderation** — comments from **trusted** or **verified** users are approved immediately; other users go to the moderation queue (same as the main forum).

### Configuration

Set `EMBED_FRAME_ANCESTORS` in `.env` to control which parent sites may embed the iframe. Use `*` for local development; in production prefer explicit origins, e.g.:

```
EMBED_FRAME_ANCESTORS=https://blog.example.com https://www.example.com
```

---

## API

The REST API is available at `/api/v1`. See [`docs/openapi.yaml`](docs/openapi.yaml) for the full spec.

Key endpoints:
- `GET /healthz` — health check
- `GET /api/v1/categories` — list categories
- `GET /api/v1/threads` — list threads (paginated)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/register` — register
- `GET /api/v1/internal/pending` — pending moderation queue (requires `MODERATION_POLL_SECRET`; see [NOTIFICATIONS.md](NOTIFICATIONS.md))
- `GET /api/v1/internal/events` — forum activity events in a date range (requires `MODERATION_POLL_SECRET`; see [NOTIFICATIONS.md](NOTIFICATIONS.md))
