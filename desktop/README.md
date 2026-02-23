# Claude Watcher Desktop

Electrobun desktop app for monitoring and managing Claude Code sessions.

## Requirements

- Bun 1.0+
- Claude Watcher Server available on `http://localhost:4242` (or auto-startable)
- macOS (the app uses macOS integrations such as `osascript`)

## Install

```bash
cd desktop
bun install
```

## Run (development)

```bash
bun run dev
```

## Build

```bash
bun run build
```

To produce a distributable `.app` + `.zip`, run from repository root:

```bash
bun run deploy
```

## Test

```bash
bun test
```

## Server Auto-start Behavior

When desktop starts, it checks whether the watcher server is already up.

If the server is not running, desktop tries these entrypoints in order:

1. `CLAUDE_WATCHER_SERVER` environment variable
2. `../server/src/server.js` resolved from current working directory
3. `server/src/server.js` resolved from current working directory

If no valid entrypoint exists, desktop continues in degraded mode and does not crash.

Example override:

```bash
export CLAUDE_WATCHER_SERVER="/absolute/path/to/server/src/server.js"
```

If Claude CLI is installed in a non-standard location, set:

```bash
export CLAUDE_BIN="/absolute/path/to/claude"
```
