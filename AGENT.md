# Tango — Agent Documentation

This document provides technical details for AI agents working on the Tango codebase.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop App (Electrobun)                                   │
│  ├─ Bun Main Process                                        │
│  │  ├─ session-manager.ts      Spawns `claude -p` sessions │
│  │  ├─ watcher-client.ts       Polls localhost:4242        │
│  │  ├─ approval-server.ts      HTTP server for tool perms  │
│  │  ├─ diff-provider.ts        Git diff + snapshot diff    │
│  │  ├─ transcript-reader.ts    Parses .jsonl transcripts   │
│  │  ├─ session-history.ts      Reads ~/.claude/projects/   │
│  │  ├─ stage-store.ts           Persists stages              │
│  │  └─ session-names-store.ts  Custom session names        │
│  └─ WebView (Native WebKit)                                │
│     ├─ sidebar.ts               Stage/session list          │
│     ├─ chat-view.ts             Chat UI + tool approvals   │
│     ├─ diff-view.ts             Diff viewer                │
│     └─ files-panel.ts           Changed files list         │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ HTTP polling
         ▼
┌─────────────────────────┐     ┌──────────────────┐
│  Watcher Server (:4242) │◄────│ Claude Code Hooks │
│  (Node.js, src/server.js)│    │ POST /api/events  │
└─────────────────────────┘     └──────────────────┘
```

## Key Technologies

- **Electrobun**: Desktop framework using Bun runtime + native WebKit webview
- **Bun**: JavaScript runtime for the main process
- **RPC**: Typed bidirectional communication between main process and webview
- **Claude CLI**: `claude -p --input-format stream-json --output-format stream-json --verbose`

## Desktop App Structure

### Main Process (Bun)

**Location**: `desktop/src/bun/`

#### session-manager.ts
Spawns and manages Claude CLI processes using bidirectional stream-json mode.

Key methods:
- `spawn(prompt, cwd, fullAccess, resumeId)` - Spawns a new Claude session
- `sendMessage(sessionId, text)` - Sends follow-up prompt to running session
- `respondPermission(sessionId, toolUseId, allow)` - Responds to permission requests (unused with hook system)
- `kill(sessionId)` - Terminates a session

Spawn args:
- `-p` - Print mode (non-interactive)
- `--input-format stream-json` - Accept JSON on stdin
- `--output-format stream-json` - Output JSON events to stdout
- `--verbose` - Include full event details
- `--dangerously-skip-permissions` (conditional) - Auto-approve tools when "Full Access" is enabled

#### approval-server.ts
HTTP server (port 4243) that receives tool approval requests from PreToolUse hook scripts.

Flow:
1. Hook POSTs to `/api/tool-approve` with tool details
2. Server checks if session is app-managed (`#managedSessions`)
3. If not managed → return `{ allow: true }` immediately (external session)
4. If managed → long-poll (120s timeout) until user clicks Allow/Deny in UI

#### watcher-client.ts
Polls the watcher server at `localhost:4242/api/snapshot` every 2s.

Snapshot structure:
```typescript
{
  timestamp: string;
  processes: ProcessInfo[];
  tasks: Task[];
  subagents: Subagent[];
  eventCount: number;
}
```

#### diff-provider.ts
Two modes:
1. **Git mode**: Runs `git diff HEAD`, parses unified diff
2. **Snapshot mode**: For non-git stages, captures file state before session starts, then compares with LCS algorithm

#### transcript-reader.ts
Parses `.jsonl` transcript files from `~/.claude/projects/`.

Each line is a JSON object with:
- `type`: "user" | "assistant" | "system" | "file-history-snapshot" | "progress"
- `message`: { role, content }
- `timestamp`, `session_id`, etc.

#### session-history.ts
Scans `~/.claude/projects/<encoded-path>/*.jsonl` for historical sessions.

Path encoding: `/Users/foo/bar` → `-Users-foo-bar`

Returns metadata: sessionId, prompt, topic, cwd, model, timestamps, transcriptPath

#### stage-store.ts
Persists recent stages to `~/.tango/stages.json`

#### session-names-store.ts
Persists custom session names to `~/.tango/session-names.json`

Format: `{ "session-id-uuid": "My Custom Name" }`

#### hook-installer.ts
Auto-installs the PreToolUse hook on startup:
1. Writes hook script to `~/.tango/hooks/pre-tool-use.sh`
2. Adds entry to `~/.claude/settings.json` under `hooks.PreToolUse`

Hook logic:
- Checks if approval server is running (`/api/ping`)
- If not → allow tool
- POSTs to `/api/tool-approve` and waits for response (long-poll, 120s timeout)
- Outputs structured JSON with `permissionDecision: "allow"` or `"deny"`

### WebView (Browser)

**Location**: `desktop/src/mainview/`

#### Components

**sidebar.ts**
- Renders stages and sessions
- Supports expand/collapse stages
- 3-dot menu for session rename
- Activity indicators (working, waiting, idle, finished)
- Blocks re-render while rename input is active

**chat-view.ts**
- Renders chat messages (user/assistant bubbles)
- Streams live events from `claude -p`
- Tool use/result rendering as collapsible `<details>`
- Tool approval dialogs (from PreToolUse hook via RPC)
- Permission toggle (Full Access checkbox)
- Stop button (kills running session)

Event handling:
- `system/init` → Show "Claude is thinking..."
- `assistant` → Render text/tool_use blocks
- `user` → Render tool_result blocks (from auto-execution)
- `result` → Show cost/turns, hide stop button
- `error` → Show error message

**diff-view.ts**
- Unified/split diff modes
- Syntax highlighting for add/delete/context lines
- Line numbers

**files-panel.ts**
- Tree/flat view toggle
- Shows added/modified/deleted/renamed files

#### State Management

**State shape**:
```typescript
{
  snapshot: Snapshot | null;
  stages: string[];
  expandedStages: Set<string>;
  activeStage: string | null;
  activeSessionId: string | null;
  historySessions: Record<string, HistorySession[]>; // keyed by stage path
  liveSessions: Set<string>; // IDs with running processes
  customSessionNames: Record<string, string>;
}
```

**RPC contract** (desktop/src/shared/types.ts):
- Requests: getSessions, getTranscript, sendPrompt, sendFollowUp, killSession, renameSession, etc.
- Messages: snapshotUpdate, sessionStream, sessionIdResolved, sessionEnded, toolApproval

### Key Flows

#### Session Creation
1. User types prompt + clicks Send (with Full Access on/off)
2. `onSendPrompt(prompt, fullAccess)` → `sendPrompt` RPC
3. Main process: `sessions.spawn(prompt, cwd, fullAccess, resumeId)`
4. Registers session in `approvals.#managedSessions`
5. Returns tempId to webview
6. Session starts, emits `system/init` with realId
7. Main process: `onIdResolved(tempId, realId)` → webview updates activeSessionId

#### Tool Approval (Hook-based)
1. Claude wants to use a tool (e.g., Write)
2. PreToolUse hook fires, reads stdin JSON
3. Hook POSTs to `localhost:4243/api/tool-approve`
4. Approval server checks if session is managed
5. If yes → long-poll, pushes `toolApproval` message to webview
6. Chat shows amber-bordered dialog with Allow/Deny buttons
7. User clicks Allow → `respondToolApproval` RPC
8. Server resolves HTTP response with `{ allow: true }`
9. Hook outputs JSON `{ hookSpecificOutput: { permissionDecision: "allow" } }`
10. Tool executes

#### Session Rename
1. User clicks 3-dot menu → Rename
2. Inline input appears, sidebar blocks re-render
3. User types new name + Enter
4. `onRenameSession(sessionId, newName)` → `renameSession` RPC
5. Backend saves to `~/.tango/session-names.json`
6. Webview updates `customSessionNames` state
7. `buildStageData()` applies custom name over topic
8. Sidebar re-renders with new name

## File Locations

### Config/Data
- `~/.claude/settings.json` - Claude Code settings, hooks config
- `~/.claude/projects/<encoded-path>/<session-id>.jsonl` - Transcripts
- `~/.tango/hooks/pre-tool-use.sh` - Tool approval hook
- `~/.tango/stages.json` - Recent stages
- `~/.tango/session-names.json` - Custom session names
- `~/.tango/snapshots/<cwd-hash>/` - Non-git stage snapshots

### Source
- `desktop/src/bun/` - Main process (Bun)
- `desktop/src/mainview/` - WebView (browser)
- `desktop/src/shared/types.ts` - RPC contract + shared types
- `desktop/electrobun.config.ts` - Electrobun build config
- `src/server.js` - Watcher server (Node.js)
- `src/taskStore.js` - Task lifecycle, event normalization

## Development

```bash
# Desktop app
cd desktop
bun install
bun run start     # Clean, build, dev
bun test          # Run tests
npx electrobun build && npx electrobun dev

# Server
npm start         # Starts on :4242
npm test          # Run tests
```

## Testing

- **Desktop tests**: `bun test` (29 tests, some pre-existing failures)
- **Server tests**: `node --test 'test/*.test.js'` (83/84 pass, 1 pre-existing failure)

Pre-existing issues:
- `test/transcriptReader.test.js` "handles content as array of content blocks" - topic truncation adds "..."
- Desktop: `test() inside test()` not implemented in Bun

## Common Gotchas

1. **Electrobun drag regions**: Use inline `style="app-region: drag"`, NOT CSS `-webkit-app-region`
2. **Bun.spawn stdin**: Returns `FileSink`, use `.write()` and `.flush()` directly
3. **Session ID resolution**: CLI assigns real ID on `system/init` event. Use tempId until then.
4. **RPC ordering**: Messages are ordered — `sessionIdResolved` always arrives before events with realId
5. **Hook exit codes**: Exit 0 with JSON `permissionDecision`, NOT exit code 2 (buggy in Claude CLI)
6. **Sidebar re-render**: Block render while `#renamingSessionId` or `#openMenuSessionId` is set
7. **External sessions**: Hook must check if session is app-managed, otherwise allow immediately

## UI Color Palette

- Background: `#262624`
- Secondary BG: `#1F1E1D`
- User bubble: `#141413` with `#FAF9F5` text
- Claude bubble: `#1F1E1D` with `#FAF9F5` text
- Hover: `#2F2E2C`
- Active: `#363533`
- Border: `#363533`
- Text primary: `#FAF9F5`
- Text secondary: `#A8A7A2`
- Text tertiary: `#6B6A66`

## Known Bugs

- PreToolUse hook exit code 2 is unreliable (Claude CLI issues #21988, #24327)
- Workaround: Use exit 0 with JSON `permissionDecision: "deny"` instead

## Memory Notes

See `~/.claude/projects/-Users-martingonzalez-Desktop-claude-watcher/memory/MEMORY.md`
