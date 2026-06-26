#!/usr/bin/env bash
# Manual SQLite backup script for forum-furiosum.
# Prints the scp command to run locally to pull the DB from the VPS.
#
# Usage: ./scripts/backup.sh [user@host] [remote-db-path]
#
# Example: ./scripts/backup.sh admin@my-vps.example.com /home/admin/forum-furiosum/db.sqlite

REMOTE_USER_HOST="${1:-admin@your-vps.example.com}"
REMOTE_DB_PATH="${2:-/home/admin/forum-furiosum/db.sqlite}"
LOCAL_DIR="${3:-.}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOCAL_FILE="${LOCAL_DIR}/forum-backup-${TIMESTAMP}.sqlite"

echo "Run the following command to back up the database:"
echo ""
echo "  scp ${REMOTE_USER_HOST}:${REMOTE_DB_PATH} ${LOCAL_FILE}"
echo ""
echo "Or for a live-safe hot backup (recommended while server is running):"
echo ""
echo "  ssh ${REMOTE_USER_HOST} \"sqlite3 ${REMOTE_DB_PATH} '.backup /tmp/forum-backup.sqlite'\" && \\"
echo "  scp ${REMOTE_USER_HOST}:/tmp/forum-backup.sqlite ${LOCAL_FILE} && \\"
echo "  ssh ${REMOTE_USER_HOST} 'rm /tmp/forum-backup.sqlite'"
echo ""
echo "Backup would be saved to: ${LOCAL_FILE}"
