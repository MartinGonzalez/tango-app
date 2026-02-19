# Claude Watcher

Local-first dashboard that monitors all running Claude instances on your machine. Displays process ID, parent app, activity state, and task context (what Claude is doing) by combining OS process scanning with hook-driven event ingestion.

## What's Included

### Watcher Server (Node.js)
HTTP server that monitors Claude processes and exposes API endpoints.

- **Location**: `src/server.js`, `src/processScanner.js`, `src/taskStore.js`
- **Port**: 4242
- **Tech**: Node.js ESM, no dependencies, stdlib only

### Desktop App (Electrobun)
Native desktop application that provides a full-featured UI for managing Claude sessions.

- **Location**: `desktop/`
- **Tech**: Electrobun (Bun + native WebKit), TypeScript
- **Features**:
  - Spawn and manage Claude sessions with interactive chat UI
  - Live streaming output from Claude
  - Tool approval dialogs (Allow/Deny for Write, Bash, etc.)
  - Session history (reads from `~/.claude/projects/`)
  - Custom session naming (rename sessions in sidebar)
  - Workspace management (multiple project folders)
  - Git diff viewer (unified/split modes)
  - Snapshot-based diff for non-git workspaces
  - Full Access toggle (bypass permissions per session)
  - Stop button to terminate running sessions

## Architecture

The desktop app spawns Claude CLI sessions using `claude -p --input-format stream-json --output-format stream-json --verbose`. This provides full bidirectional communication — the app can send prompts, receive streaming responses, and handle tool permissions through a custom PreToolUse hook system.

### Tool Permission System

The app installs a PreToolUse hook that intercepts tool calls and shows interactive Allow/Deny dialogs:

1. Claude wants to use a tool (Write, Bash, etc.)
2. PreToolUse hook fires and POSTs to the app's approval server (port 4243)
3. App shows an amber-bordered dialog with tool details
4. User clicks Allow/Deny
5. Hook receives response and Claude proceeds/cancels

**Key feature**: The hook only intercepts tools for sessions spawned by the app. External sessions (like terminal sessions with bypass) are allowed automatically.

## Desktop App Usage

### Starting the App

```bash
cd desktop
bun run start       # Clean + build + dev
```

Or separately:
```bash
bun install
npx electrobun build
npx electrobun dev
```

### Creating a Session

1. Open a workspace (Cmd+O or "Open Workspace" button)
2. Type a prompt in the chat input
3. Toggle "Full Access" if you want to bypass permission dialogs
4. Click Send or press Enter

### Managing Sessions

- **Rename**: Click the 3-dot menu (⋮) next to a session, select "Rename"
- **Resume**: Click any historical session in the sidebar to load its transcript, then send a new prompt
- **Stop**: Click the red "Stop" button while Claude is working
- **View History**: Expand a workspace to see all sessions for that project

### Viewing Changes

The diff panel shows:
- Git diff (if workspace has .git)
- Snapshot-based diff (for non-git workspaces)
- File tree (tree/flat toggle)
- Unified/split view modes

### Keyboard Shortcuts

- `Cmd+N` — New session
- `Cmd+O` — Open workspace
- `Cmd+B` — Toggle sidebar
- `Enter` — Send prompt (Shift+Enter for newline)

## Configuration

### Session Names
Stored in `~/.claude-sessions/session-names.json`

Format:
```json
{
  "session-id-uuid": "My Custom Name"
}
```

### Workspaces
Stored in `~/.claude-sessions/workspaces.json`

Format:
```json
[
  "/Users/name/project1",
  "/Users/name/project2"
]
```

### Hook Installation
The PreToolUse hook is auto-installed on first run:
- Script: `~/.claude-sessions/hooks/pre-tool-use.sh`
- Registered in: `~/.claude/settings.json` under `hooks.PreToolUse`

You can customize the approval server port with:
```bash
export CLAUDE_APPROVAL_PORT=4243
```

## Server Usage

The watcher server runs independently of the desktop app. It monitors all Claude processes on the machine and provides API endpoints.

```bash
npm start           # Start server on :4242
npm test            # Run tests
```

### API Endpoints

- `GET /health` — Health check
- `GET /api/snapshot` — Current state (processes + tasks + subagents)
- `POST /api/events` — Ingest task lifecycle events

### Hook Integration

The watcher server receives events from Claude Code hooks. Example hook:

```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

curl -s -X POST "http://localhost:4242/api/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"task-update\",
    \"session_id\": \"$SESSION_ID\",
    \"current_task\": \"Using $TOOL\",
    \"status\": \"running\"
  }" > /dev/null 2>&1
```

## Development

### Project Structure

```
claude-watcher/
├── src/                    # Watcher server (Node.js)
│   ├── server.js
│   ├── processScanner.js
│   ├── taskStore.js
│   └── ...
├── desktop/                # Desktop app (Electrobun)
│   ├── src/
│   │   ├── bun/           # Main process
│   │   │   ├── index.ts
│   │   │   ├── session-manager.ts
│   │   │   ├── approval-server.ts
│   │   │   └── ...
│   │   ├── mainview/      # WebView
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   └── styles.css
│   │   └── shared/
│   │       └── types.ts   # RPC contract
│   ├── electrobun.config.ts
│   └── package.json
├── test/                  # Server tests
└── public/                # Legacy web dashboard
```

### Testing

Desktop app:
```bash
cd desktop
bun test                    # 29 tests
```

Server:
```bash
node --test 'test/*.test.js'  # 83/84 tests pass
```

### Building

The desktop app is built with Electrobun:

```bash
cd desktop
npx electrobun build
```

Output: `desktop/build/dev-macos-arm64/Claude Sessions-dev.app`

For production builds, see `electrobun.config.ts` for code signing and notarization settings.

## Environment Variables

### Desktop App
- `CLAUDE_APPROVAL_PORT` — Approval server port (default: 4243)

### Server
- `PORT` — Server port (default: 4242)
- `POLL_MS` — Process scan interval in ms (default: 2000)
- `CLAUDE_WATCHER_URL` — Used by hooks to target the server

## Data Persistence

The desktop app persists data in `~/.claude-sessions/`:
- `workspaces.json` — Recent workspaces
- `session-names.json` — Custom session names
- `hooks/pre-tool-use.sh` — Tool approval hook
- `snapshots/<hash>/` — Non-git workspace snapshots

The app also reads from Claude Code's data directory:
- `~/.claude/projects/<encoded-path>/<session-id>.jsonl` — Session transcripts
- `~/.claude/settings.json` — Hook configuration

## Troubleshooting

### Sessions stuck on "Waiting for approval"
This happens if the approval hook is installed but the app isn't running. The hook times out after 120s and defaults to allowing the tool.

To bypass the hook entirely for terminal sessions, use:
```bash
claude -p --dangerously-skip-permissions "your prompt"
```

### Diff not showing for non-git workspace
The app takes a snapshot of the workspace when you create a session. If you modify files before creating a session, those changes won't appear in the diff. Create a new session to capture a fresh snapshot.

### Session names not persisting
Session names are stored locally in `~/.claude-sessions/session-names.json`. Make sure this file is writable and not being cleared by system cleanup tools.

### App won't start watcher server
The app tries to auto-start the watcher server if it's not running. If this fails, start it manually:
```bash
npm start
```

Or set the server path explicitly:
```bash
export CLAUDE_WATCHER_SERVER=/path/to/server.js
```

## Contributing

This is a local-first tool for monitoring Claude instances. Key principles:

- **No external dependencies** — Server uses only Node.js stdlib
- **TDD approach** — Write tests before implementation
- **Semantic commit messages** — Use `fix:`, `feat:`, `docs:`, `chore:` prefixes
- **Rebase workflow** — Clean, linear history

See `AGENT.md` for detailed technical documentation.
