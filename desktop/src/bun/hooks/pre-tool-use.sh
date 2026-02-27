#!/bin/bash
# PreToolUse hook for Tango app.
# Blocks until the user approves/denies the tool in the app UI.
# Falls back to allowing if the app is not running.

INPUT=$(cat)
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# No tool use ID → allow
if [ -z "$TOOL_USE_ID" ]; then
  exit 0
fi

APPROVAL_PORT="${CLAUDE_APPROVAL_PORT:-4243}"

# POST to approval server and wait (long-poll, max 120s)
RESPONSE=$(curl -sf --max-time 120 -X POST "http://localhost:$APPROVAL_PORT/api/tool-approve" \
  -H "Content-Type: application/json" \
  -d "{\"tool_use_id\": \"$TOOL_USE_ID\", \"tool_name\": \"$TOOL_NAME\", \"tool_input\": $TOOL_INPUT, \"session_id\": \"$SESSION_ID\"}" 2>/dev/null)

# If curl fails (app not running, timeout) → allow by default
if [ $? -ne 0 ]; then
  exit 0
fi

ALLOW=$(echo "$RESPONSE" | jq -r '.allow // "true"')

if [ "$ALLOW" = "true" ]; then
  # Explicitly allow via structured JSON (overrides CLI permission checks)
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "User approved in Tango app"
  }
}
EOF
  exit 0
else
  # Deny via structured JSON output
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "User denied this tool in Tango app"
  }
}
EOF
  exit 0
fi
