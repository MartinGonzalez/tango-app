#!/bin/bash
INPUT=$(cat)
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"
APPROVAL_PORT="${CLAUDE_APPROVAL_PORT:-4243}"
PAYLOAD=$(echo "$INPUT" | jq -c ". + {process_id: $PPID}")
# Send to watcher server
curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1
# Send to desktop app (fire-and-forget for diff/stage refresh)
curl -s --max-time 0.5 -X POST "http://localhost:$APPROVAL_PORT/api/hook-event" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 &
exit 0
