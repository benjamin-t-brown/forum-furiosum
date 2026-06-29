#!/bin/sh
# Run Discord notify inside the production Docker container (for host cron/systemd).
# Requires the same env vars on the container as `npm run notify` (FORUM_BASE_URL, etc.).
#
# Usage:
#   ./scripts/notify.docker.sh
#   ./scripts/notify.docker.sh --dry-run
#   FORUM_CONTAINER_NAME=my-forum ./scripts/notify.docker.sh
#
# Example cron (every 5 minutes):
#   */5 * * * * /path/to/forum-furiosum/scripts/notify.docker.sh >> /var/log/forum-notify.log 2>&1

set -e

CONTAINER="${FORUM_CONTAINER_NAME:-forum-furiosum}"

exec docker exec "$CONTAINER" node dist/notify.js "$@"
