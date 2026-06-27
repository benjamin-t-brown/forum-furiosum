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
- npm 11.17+ (pinned via Corepack — see [Adding and updating dependencies](ADD__UPDATE_DEPS.md))

### Setup

```bash
# Clone and install dependencies
npm install
```

For dependency policy, version pinning, and install-script allowlists, see [ADD__UPDATE_DEPS.md](ADD__UPDATE_DEPS.md).

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

## Docker Deployment

### Build

```bash
docker build -t forum-furiosum .
```

### Run

```bash
docker run -d \
  --name forum-furiosum \
  -p 9827:9827 \
  -v /home/admin/forum-furiosum:/data \
  -e NODE_ENV=production \
  -e PORT=9827 \
  -e DB_PATH=/data/db.sqlite \
  -e SESSION_SECRET=your-long-random-secret \
  -e ADMIN_BOOTSTRAP_EMAIL=admin@yourdomain.com \
  -e ADMIN_BOOTSTRAP_PASSWORD=your-strong-password \
  -e ADMIN_BOOTSTRAP_USERNAME=admin \
  forum-furiosum
```

The database is stored at `DB_PATH` inside the container — mount a host directory to persist it.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` or `development` |
| `PORT` | No | `9827` | HTTP port |
| `DB_PATH` | Yes | `./forum.sqlite` | Path to SQLite DB file |
| `SESSION_SECRET` | Yes | — | Long random string for session signing |
| `ADMIN_BOOTSTRAP_EMAIL` | Prod only | `admin@admin.com` (dev) | Admin account email for first run |
| `ADMIN_BOOTSTRAP_PASSWORD` | Prod only | `test12345` (dev) | Admin account password for first run |
| `ADMIN_BOOTSTRAP_USERNAME` | No | `admin` | Admin account username for first run |
| `EMBED_FRAME_ANCESTORS` | No | `*` | CSP `frame-ancestors` for embed routes; restrict to your blog origin(s) in production |

---

## Embeddable comment threads

A thread can be embedded at the bottom of external pages (blog posts, announcements) as a comment thread iframe.

### Enable embedding

1. Open **Admin → Review Thread** for the thread you want to embed.
2. Check **Allow embedding**.
3. Save changes, then copy the iframe snippet shown on that page.

Example:

```html
<iframe src="https://your-forum.example.com/embed/threads/THREAD_ID" width="100%" height="480" style="border:0" title="Comments"></iframe>
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

## Database Backup

The forum uses SQLite. To manually back up the database from a VPS:

```bash
bash scripts/backup.sh admin@your-vps.example.com /home/admin/forum-furiosum/db.sqlite
```

This prints the `scp` command to run. For a live-safe backup while the server is running, use the `sqlite3 .backup` command shown by the script.

---

## API

The REST API is available at `/api/v1`. See [`docs/openapi.yaml`](docs/openapi.yaml) for the full spec.

Key endpoints:
- `GET /healthz` — health check
- `GET /api/v1/categories` — list categories
- `GET /api/v1/threads` — list threads (paginated)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/register` — register

---

## Routes

| Path | Description |
|---|---|
| `/` | Home — category list with recent threads |
| `/threads/:id` | Thread view with posts |
| `/embed/threads/:id` | Embeddable comment thread (iframe) |
| `/threads/new` | Create thread |
| `/threads/:id/edit` | Edit thread |
| `/register` | Register |
| `/login` | Login |
| `/users/:id` | User profile |
| `/users/:id/edit` | Edit profile |
| `/admin` | Admin dashboard |
| `/admin/threads/:id/edit` | Moderate thread |
| `/admin/posts/:id/edit` | Moderate post |
| `/admin/users/:id/edit` | Edit user role/trust |
| `/admin/settings` | Forum settings |
