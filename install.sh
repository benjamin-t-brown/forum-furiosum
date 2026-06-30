#!/usr/bin/env bash
# Install dependencies and prepare local development environment.
#
# Usage: ./install.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Forum Furiosum — development install"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (>= 20). See https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20+ required (found $(node -v))" >&2
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  NPM_VER="$(npm -v)"
  NPM_MAJOR="${NPM_VER%%.*}"
  NPM_MINOR="${NPM_VER#*.}"
  NPM_MINOR="${NPM_MINOR%%.*}"
  if [ "$NPM_MAJOR" -lt 11 ] || { [ "$NPM_MAJOR" -eq 11 ] && [ "$NPM_MINOR" -lt 17 ]; }; then
    echo "Warning: npm 11.17+ recommended (found ${NPM_VER}). See docs/ADD_UPDATE_DEPS.md" >&2
  fi
fi

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "    Edit .env and set SESSION_SECRET before production use."
else
  echo "==> .env already exists"
fi

echo "==> Installing npm dependencies"
npm install

echo ""
echo "Install complete. Start the dev server with:"
echo "  ./run.sh"
