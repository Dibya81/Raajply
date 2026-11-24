#!/bin/bash
# Double-click on a Mac to start the Raajply ERP prototype.
cd "$(dirname "$0")" || exit 1
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then double-click this file again."
  read -r -p "Press Enter to close…"
  exit 1
fi
PORT="${PORT:-4000}"
# Stop any older copy still running on this port, so the latest code is always served.
OLD=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD" ]; then echo "Stopping the old server ($OLD)…"; kill $OLD 2>/dev/null; sleep 1; fi
( sleep 1.5; open "http://localhost:$PORT" ) &
PORT="$PORT" node server/server.js
