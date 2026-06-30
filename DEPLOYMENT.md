# Deployment

Production deployment uses Docker. The image does not include a `.env` file — pass configuration at **`docker run`** time with `--env-file` (recommended).

Image: `442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest`

---

## Build

```bash
docker build -t revirtualis/forum-furiosum
docker tag revirtualis/forum-furiosum:latest 442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest
```

---

## Push to AWS ECR

Log in to the registry, then push:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 442979135069.dkr.ecr.us-east-1.amazonaws.com

docker push 442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest
```

---

## Prepare environment file

On the server, create an env file from the template and edit secrets:

```bash
cp .env.example /home/admin/forum-furiosum/.env
# edit /home/admin/forum-furiosum/.env
```

For production, set at least:

- `NODE_ENV=production`
- `DB_PATH=/data/db.sqlite` — must match the in-container path used with the volume mount below
- `SESSION_SECRET` — long random string
- `ADMIN_BOOTSTRAP_*` — first-run admin (change password after login)
- `BASE_PATH` — if served under a subpath (e.g. `/forum-furiosum`)
- `EMBED_FRAME_ANCESTORS` — parent site(s) allowed to embed
- `MODERATION_POLL_SECRET` — enables internal moderation/events API (optional; see [NOTIFICATIONS.md](NOTIFICATIONS.md))

See [Environment variables](#environment-variables) and `.env.example` for the full list. For Discord notify, see [NOTIFICATIONS.md](NOTIFICATIONS.md).

---

## Run

On the server, pull the image (after pushing from your build machine), then run:

```bash
docker pull 442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest

docker run -d \
  --name forum-furiosum \
  --restart unless-stopped \
  -p 127.0.0.1:9827:9827 \
  -v /home/admin/forum-furiosum:/data \
  --env-file /home/admin/forum-furiosum/.env \
  442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest
```

- **`--env-file`** loads every `KEY=value` from the file into the container (comments and blank lines are fine).
- **`-v …:/data`** persists the SQLite database on the host; keep `DB_PATH=/data/db.sqlite` in the env file.
- **`-p 127.0.0.1:9827:9827`** binds locally so nginx can reverse-proxy; omit the `127.0.0.1:` prefix only if you need the port reachable from outside the host.

To change configuration later, edit the env file, then recreate the container:

```bash
docker stop forum-furiosum
docker rm forum-furiosum
# docker run … (same command as above)
```

Environment is fixed at container creation time.

Verify variables inside the running container:

```bash
docker exec forum-furiosum printenv BASE_PATH DB_PATH
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` or `development` |
| `PORT` | No | `9827` | HTTP port |
| `BASE_PATH` | No | — | Subpath prefix when behind a reverse proxy (e.g. `/forum-furiosum`; no trailing slash) |
| `DB_PATH` | Yes | `./forum.sqlite` | Path to SQLite DB file **inside the container** |
| `SESSION_SECRET` | Yes | — | Long random string for session signing |
| `ADMIN_BOOTSTRAP_EMAIL` | Prod only | `admin@admin.com` (dev) | Admin account email for first run |
| `ADMIN_BOOTSTRAP_PASSWORD` | Prod only | `test12345` (dev) | Admin account password for first run |
| `ADMIN_BOOTSTRAP_USERNAME` | No | `admin` | Admin account username for first run |
| `EMBED_FRAME_ANCESTORS` | No | `*` | CSP `frame-ancestors` for embed routes; restrict to your blog origin(s) in production |
| `MODERATION_POLL_SECRET` | No | — | Enables internal moderation/events API — see [NOTIFICATIONS.md](NOTIFICATIONS.md) |

---

## Reverse proxy (subpath)

To serve the forum at a path like `https://example.com/forum-furiosum` (not the domain root):

1. Set `BASE_PATH=/forum-furiosum` in the env file (no trailing slash).
2. Configure nginx to strip the path prefix when proxying — see [`docs/nginx-subpath.conf.example`](docs/nginx-subpath.conf.example).

The app enables `trust proxy` so HTTPS and embed URLs work correctly behind nginx.

---

## Database backup

The forum uses SQLite on the mounted volume. To back up from a VPS:

```bash
bash scripts/backup.sh admin@your-vps.example.com /home/admin/forum-furiosum/db.sqlite
```

This prints the `scp` command to run. For a live-safe backup while the server is running, use the `sqlite3 .backup` command shown by the script.

---

## Discord notifications

Optional. Notify cron uses the same container and env file — see [NOTIFICATIONS.md](NOTIFICATIONS.md).

---

## Ephemeral account cleanup

Inactive ephemeral (anonymous) accounts are removed after 7 days without activity. Schedule daily on the host, using the same env file and volume as the forum container:

```bash
0 3 * * * docker run --rm --env-file /home/admin/forum-furiosum/.env -v /home/admin/forum-furiosum:/data 442979135069.dkr.ecr.us-east-1.amazonaws.com/revirtualis/forum-furiosum:latest node dist/cleanup-ephemeral.js
```

For local development:

```bash
npm run cleanup:ephemeral
```
