#!/usr/bin/env bash
# Run SIGNAL in the foreground with automatic restart (Linux/macOS).
# For a real server prefer: docker compose up -d   or   deploy/signal.service (systemd)
set -u
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 20+ required: https://nodejs.org"; exit 1; }
[ -f .env ] || cp .env.example .env
if [ ! -f dist/engine.mjs ]; then npm ci --no-audit --no-fund && npm run build || exit 1; fi
export SIGNAL_SUPERVISED=1
while true; do
  node dist/engine.mjs
  code=$?
  if [ "$code" -eq 75 ]; then echo "Applying new settings..."; sleep 1; continue; fi
  echo "SIGNAL stopped (exit $code) — restarting in 5s (Ctrl+C twice to quit)"
  sleep 5
done
