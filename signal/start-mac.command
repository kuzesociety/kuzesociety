#!/bin/bash
# Double-click to run SIGNAL on a Mac. It restarts the bot if it stops and keeps the Mac
# awake while it runs. Close this window to stop.
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js is not installed yet: download the LTS version from https://nodejs.org, install it, then open this again."
  open "https://nodejs.org"
  read -r -p "Press Enter to close."
  exit 1
fi
[ -f .env ] || cp .env.example .env
if [ ! -f dist/engine.mjs ]; then
  npm ci --no-audit --no-fund && npm run build || { read -r -p "Build failed - see above. Press Enter."; exit 1; }
fi
export SIGNAL_SUPERVISED=1
export SIGNAL_OPEN_BROWSER=1
export SIGNAL_SELF_UPDATE=1
# the loop is read whole before it runs, so an update may replace this file meanwhile
while true; do
  caffeinate -i node dist/engine.mjs
  code=$?
  if [ "$code" -eq 75 ]; then echo "Applying new settings..."; sleep 1; continue; fi
  if [ "$code" -eq 74 ]; then echo "SIGNAL is already running in another window, so this one can be closed."; sleep 10; exit 0; fi
  echo "SIGNAL stopped (exit $code). Restarting in 5 seconds - close this window to stop."
  sleep 5
done
