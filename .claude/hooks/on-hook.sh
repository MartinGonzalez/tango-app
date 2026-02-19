#!/bin/bash
INPUT=$(cat)
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"
PAYLOAD=$(echo "$INPUT" | jq -c ". + {process_id: $PPID}")
curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1
exit 0
