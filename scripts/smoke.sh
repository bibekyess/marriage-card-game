#!/usr/bin/env bash
# Smoke test: build + start the stack, wait for /api/health.
# Usage: scripts/smoke.sh [--down]   (--down tears the stack down afterwards)
set -u
cd "$(dirname "$0")/.."

DOWN=0
[ "${1:-}" = "--down" ] && DOWN=1
URL="http://localhost:${APP_PORT:-3000}/api/health"

finish() {
  if [ "$DOWN" = 1 ]; then docker compose down; fi
  exit "$1"
}

docker compose up -d --build || { echo "FAIL: docker compose up failed"; finish 1; }

echo "Polling $URL (up to 90s)..."
for ((i = 0; i < 45; i++)); do
  if body=$(curl -fsS --max-time 2 "$URL" 2>/dev/null); then
    echo "OK: $body"
    finish 0
  fi
  sleep 2
done

echo "FAIL: $URL not healthy after 90s"
docker compose logs --tail=50 app
finish 1
