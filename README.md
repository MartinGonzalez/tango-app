# Claude Watcher

Claude Watcher is a local-first dashboard that helps you see which Claude-related processes are running and what each one is working on.

## Why this exists

Process inspection alone cannot reliably tell intent. Claude Watcher combines:

- OS process scan (`ps`) for live Claude process discovery
- explicit task events (`task-start`, `task-update`, `task-end`) for intent metadata

## MVP capabilities

- Discover Claude CLI/app processes with PID, CPU, memory, state, and elapsed time
- Attach task context (title, session ID, cwd, notes, status) to a process
- Derive activity state (`running`, `waiting`, `idle`, `finished`) from process + task recency
- Live web dashboard with filtering and command/task search
- Local-only runtime by default (no external service required)

## Setup

### Prerequisites
- Node.js 18+
- Claude Code CLI installed and working
- `curl` and `jq` (for hook scripts)

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
```

The server runs on `http://localhost:4242` by default.

### 3. (Optional) Configure Claude Code hooks

To see task context in the dashboard, connect Claude Code hooks. These POST intent metadata to the watcher so it knows what Claude is actually doing.

**Step 3a: Set the watcher URL in your environment**

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export CLAUDE_WATCHER_URL="http://localhost:4242"
```

**Step 3b: Create hook scripts**

In your project root, create `.claude/hooks/` directory:

```bash
mkdir -p .claude/hooks
```

Create these hook scripts:

**`.claude/hooks/on-session-start.sh`:**
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
CWD=$(echo "$INPUT" | jq -r '.cwd')
MODEL=$(echo "$INPUT" | jq -r '.model // "unknown"')
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"

curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"task-start\",
    \"session_id\": \"$SESSION_ID\",
    \"title\": \"Claude session ($MODEL)\",
    \"cwd\": \"$CWD\",
    \"status\": \"running\"
  }" > /dev/null 2>&1

exit 0
```

**`.claude/hooks/on-tool-use.sh`:**
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
CWD=$(echo "$INPUT" | jq -r '.cwd')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"

curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"task-update\",
    \"session_id\": \"$SESSION_ID\",
    \"current_task\": \"Using $TOOL\",
    \"cwd\": \"$CWD\",
    \"status\": \"running\"
  }" > /dev/null 2>&1

exit 0
```

**`.claude/hooks/on-stop.sh`:**
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
CWD=$(echo "$INPUT" | jq -r '.cwd')
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"

curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"task-update\",
    \"session_id\": \"$SESSION_ID\",
    \"current_task\": \"Idle\",
    \"cwd\": \"$CWD\",
    \"status\": \"waiting\"
  }" > /dev/null 2>&1

exit 0
```

**`.claude/hooks/on-session-end.sh`:**
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
WATCHER_URL="${CLAUDE_WATCHER_URL:-http://localhost:4242}"

curl -s -X POST "$WATCHER_URL/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"task-end\",
    \"session_id\": \"$SESSION_ID\",
    \"status\": \"completed\"
  }" > /dev/null 2>&1

exit 0
```

Make them executable:
```bash
chmod +x .claude/hooks/*.sh
```

**Step 3c: Register hooks in `.claude/settings.json`**

Create or update `.claude/settings.json` in your project root:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-session-start.sh"
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-tool-use.sh"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-stop.sh"
      }
    ],
    "SessionEnd": [
      {
        "type": "command",
        "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-session-end.sh"
      }
    ]
  }
}
```

### 4. Open the dashboard

Navigate to `http://localhost:4242` in your browser. You should see:
- Running Claude processes (from `ps` scanning)
- Activity state (running, waiting, idle)
- Task context if hooks are connected

## Using the wrapper script

You can also wrap commands with task titles:

```bash
./bin/claude-watch --title "Fix flaky tests" -- claude
```

Or any command:

```bash
./bin/claude-watch --title "Run test sweep" -- npm test
```

## How it works

### Process scanning
The watcher periodically scans your system with `ps` to find Claude processes (the CLI or Claude.app). It tracks PID, CPU, memory, state, and elapsed time.

### Task context
Hook scripts POST intent metadata when Claude starts, uses tools, stops, or ends. This tells the watcher what Claude is actually doing beyond just "sleeping" or "running".

### Activity derivation
The dashboard combines process state (OS-level) with task recency (from hooks) to show:
- `running`: process executing + recent updates
- `waiting`: process sleeping + recent updates
- `idle`: no recent updates (20s threshold)
- `finished`: task explicitly ended

## API

### `GET /health`
Health check. Returns `200 OK`.

### `GET /api/snapshot`
Returns current state:
```json
{
  "processes": [
    {
      "pid": 4200,
      "ppid": 4100,
      "command": "claude",
      "cpu": 2.5,
      "memory": 150,
      "state": "sleeping",
      "elapsed": "5m"
    }
  ],
  "tasks": [
    {
      "sessionId": "abc-123",
      "pid": 4200,
      "title": "Refactor scanner",
      "cwd": "/Users/name/project",
      "status": "running",
      "activity": "running",
      "lastUpdate": "2026-02-16T12:00:00.000Z"
    }
  ]
}
```

### `POST /api/events`
Ingest task lifecycle events. Hook scripts POST here.

**Payload (example):**
```json
{
  "type": "task-start",
  "sessionId": "abc-123",
  "pid": 4200,
  "title": "Refactor scanner",
  "cwd": "/Users/name/project",
  "status": "running"
}
```

**Accepted field aliases** (for hook compatibility):
- `session_id` or `sessionId`
- `process_id`/`processId` or `pid`
- `current_task`/`currentTask` or `title`

If no PID is provided, the watcher falls back to `single-active` attribution (finds the only active task).

## Architecture

- **`src/processScanner.js`**: Scans `ps` output to find Claude processes, extracts PID, CPU, memory, state
- **`src/taskStore.js`**: Stores task events in memory, manages lifecycle, handles PID attribution
- **`src/server.js`**: HTTP server on `:4242`, serves API endpoints and static dashboard
- **`public/`**: Browser dashboard (vanilla JS, polls `/api/snapshot` every 2s)
- **`bin/claude-watch`**: CLI wrapper for running commands with task context
- **`.claude/hooks/`**: Hook scripts that POST events to the watcher

## Running

```bash
npm start              # Start server (localhost:4242)
npm test               # Run unit tests
npm run dev            # (Optional) Run with auto-reload
```

## Environment Variables

- `PORT` - Server port (default: `4242`)
- `POLL_MS` - Process scan interval in ms (default: `2000`)
- `CLAUDE_WATCHER_URL` - Used by hook scripts to target the server (default: `http://localhost:4242`)

## Testing

```bash
npm test
```

Unit tests cover:
- Process parsing and Claude process detection
- Task lifecycle (start/update/end)
- PID-based and single-active task attribution
- Idle state detection
