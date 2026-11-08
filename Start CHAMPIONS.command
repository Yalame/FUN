#!/bin/bash
# Double-click to open CHAMPIONS on this Mac (works without internet).
# Always opens the same address, so your history is always found again.
cd "$(dirname "$0")" || exit 1
PORT=8777
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  nohup python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 1
fi
open "http://localhost:$PORT"
