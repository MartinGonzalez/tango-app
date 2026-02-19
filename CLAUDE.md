# Claude Watcher

Local-first dashboard server that monitors all running Claude instances on the machine. Displays process ID, parent app, activity state, and task context (what Claude is doing) by combining OS process scanning with hook-driven event ingestion.

## Architecture

```
bin/claude-watch      CLI wrapper that emits task-start/update/end events to the server
src/server.js         HTTP server (port 4242) - serves API + static dashboard
src/processScanner.js Scans `ps` output to discover Claude processes (PID, PPID, CPU, MEM, state, elapsed)
src/taskStore.js      In-memory event store managing task lifecycle per session
public/               Browser dashboard (vanilla JS, polls /api/snapshot every 2s)
```

## Key Concepts

- **Process scanning**: `ps -axo` parses running processes and filters for Claude CLI (`claude` binary) and Claude.app
- **Task events**: External hooks POST `task-start`, `task-update`, `task-end` to `/api/events` with sessionId, pid, title, cwd, status, notes
- **Attribution**: Links a process to a task by exact PID match, or falls back to `single-active` when only one unfinished task exists
- **Activity derivation**: Combines process state (running/sleeping) + task recency (idle threshold 20s) to produce: `running`, `waiting`, `idle`, `active`, `finished`, `unknown`
- **Hook payload normalization**: Accepts both camelCase (`sessionId`, `processId`, `currentTask`) and snake_case (`session_id`, `process_id`, `current_task`)

## Claude Code Hooks Integration

The process scanner alone only sees OS-level state (`sleeping`/`running`). The real signal about what Claude is doing comes from **Claude Code hooks** — user-defined shell commands that fire at lifecycle events. Hook scripts POST events to `/api/events` so the watcher can track intent.

### Relevant Hook Events

These are the Claude Code hook events we use to feed the watcher:

| Hook Event | When it fires | What we capture |
|---|---|---|
| `SessionStart` | Session begins or resumes | session_id, cwd, model — emit `task-start` |
| `Stop` | Claude finishes a response turn | Idle/active signal — emit `task-update` |
| `PreToolUse` | Before a tool call executes | What Claude is about to do (tool_name, tool_input) — emit `task-update` |
| `PostToolUse` | After a tool call succeeds | What Claude just did — emit `task-update` |
| `Notification` | Claude sends a notification | Permission prompts, idle prompts — emit `task-update` |
| `SubagentStart` | A subagent is spawned | Subagent type — emit `task-update` |
| `SubagentStop` | A subagent finishes | Subagent completed — emit `task-update` |
| `SessionEnd` | Session terminates | emit `task-end` |

### Hook Input (stdin JSON)

All hooks receive JSON on stdin with these common fields:

```json
{
  "session_id": "abc-123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/Users/name/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

Tool-related hooks add `tool_name` and `tool_input`. SessionStart adds `source` and `model`.

### Hook Configuration

Hooks are defined in `~/.claude/settings.json` (global) or `.claude/settings.json` (per-project). The watcher hook scripts live in `.claude/hooks/` and POST to the watcher server:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-session-start.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-tool-use.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-stop.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-session-end.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Script Pattern

Each hook script reads JSON from stdin, extracts relevant fields, and POSTs to the watcher:

```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
CWD=$(echo "$INPUT" | jq -r '.cwd')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
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

### Hook Output

Hooks exit 0 to allow the action. The watcher hooks are observation-only — they never block or modify Claude's behavior. They just POST telemetry to the watcher server.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Health check |
| `/api/snapshot` | GET | Full state: processes + linked tasks + activity |
| `/api/events` | POST | Ingest task lifecycle events |

## Tech Stack

- Node.js (ESM), no dependencies
- `node:http` for the server
- `node:child_process` (`ps`) for process discovery
- Vanilla HTML/CSS/JS dashboard (Space Grotesk + Space Mono fonts)
- `node --test` for unit tests

## Running

```bash
npm start          # starts server on :4242
npm test           # runs unit tests
```

## Environment Variables

- `PORT` - server port (default: 4242)
- `POLL_MS` - process scan interval in ms (default: 2000)
- `CLAUDE_WATCHER_URL` - used by `bin/claude-watch` wrapper and hook scripts to target the server

## Testing

TDD approach. Tests live in `test/`. Currently covers:
- `processScanner.test.js` - ps output parsing, Claude process identification
- `taskStore.test.js` - task lifecycle, event normalization, PID/single-active attribution, idle detection

Run with `npm test` (uses `node --test`).

## Conventions

- ESM modules (`"type": "module"`)
- No external dependencies - stdlib only
- Private class fields (`#field`) for encapsulation in TaskStore
- Event types are strictly: `task-start`, `task-update`, `task-end`
- Session IDs are UUIDs generated by the wrapper or the calling hook
