#!/usr/bin/env bash
# Run the forum in development mode (tsx watch).
#
# Usage: ./run.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ ! -d node_modules ]; then
  echo "Error: node_modules not found. Run ./install.sh first." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Error: .env not found. Run ./install.sh first." >&2
  exit 1
fi

PORT="$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
PORT="${PORT:-9827}"

echo "==> Starting Forum Furiosum (development)"
echo "    http://localhost:${PORT}"
echo "    Default admin (dev): admin@admin.com / test12345"
echo ""

exec npm run start
