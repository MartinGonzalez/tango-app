# Developer Guide

This document explains how to set up and run Claude Watcher locally for development.

## What You Are Running

Claude Watcher has two local modules:

- `server/`: Node.js API that scans Claude processes and serves session snapshots on port `4242`
- `desktop/`: Electrobun desktop app that connects to the server

## Prerequisites

- macOS
- Node.js 18+
- Bun 1.0+
- Claude Code CLI installed and working

## First-Time Setup

From the repository root:

```bash
cd server
npm install

cd ../desktop
bun install
```

## Start the App (Recommended)

Use two terminals from the repository root.

Terminal A:

```bash
npm run dev:server
```

Terminal B:

```bash
npm run dev:desktop
```

## Alternative: Desktop Auto-Starts Server

You can start only desktop and let it try to auto-start the server:

```bash
npm run dev:desktop
```

Desktop resolves the server entrypoint in this order:

1. `CLAUDE_WATCHER_SERVER`
2. `../server/src/server.js`
3. `server/src/server.js`

If needed, force a custom server path:

```bash
export CLAUDE_WATCHER_SERVER="/absolute/path/to/server/src/server.js"
```

## Verify It Is Running

- Server health check:

```bash
curl http://localhost:4242/health
```

Expected response:

```json
{"ok":true}
```

- Desktop should open the Claudex window and begin polling snapshots.

## Test Commands

From the repository root:

```bash
npm run test:server
npm run test:desktop
npm test
```

## Useful Commands

From `desktop/`:

```bash
bun run clean
bun run kill-server
bun run kill-app
```

From `server/`:

```bash
npm start
npm test
```

## Troubleshooting

- Port `4242` already in use:

```bash
cd desktop
bun run kill-server
```

- Desktop opens but no data appears:
1. Check `http://localhost:4242/health`
2. Start server manually with `npm run dev:server`
3. Relaunch desktop

- Auto-start fails:
1. Set `CLAUDE_WATCHER_SERVER`
2. Restart desktop

- Session stays on "Starting Claude...":
1. Ensure Claude CLI is installed
2. Set `CLAUDE_BIN` to the full Claude binary path
3. Restart desktop

## Contribution Checklist

Before opening a PR:

1. Run `npm test` from the repository root
2. Ensure the app starts with `npm run dev:server` + `npm run dev:desktop`
3. Update docs if behavior or commands changed

## Build a macOS Deliverable

From the repository root:

```bash
bun run deploy
```

Artifacts are created in `dist/`:

- `Claudex.app`
- `Claudex-macos-arm64.zip`

`bun run deliver` runs the same script.
