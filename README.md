# Claude Watcher

Claude Watcher is a local control center for Claude Code sessions.

It helps you track what Claude is doing across workspaces, inspect file changes, and review git history without losing context.

## Prerequisites

Before installing, make sure your machine has:

- macOS (Apple Silicon build)
- Claude Code CLI installed and working (`claude` command)
- Node.js 18+ available in your shell

If `claude` is installed in a custom path, set:

```bash
export CLAUDE_BIN="/absolute/path/to/claude"
```

## Install

1. Download the latest release artifact (`Claudex-macos-arm64.zip`).
2. Unzip it.
3. Move `Claudex.app` to your `Applications` folder (recommended).
4. Open `Claudex.app`.

## First Run

1. Launch Claudex.
2. Add or select a workspace.
3. Start a new session from the app.

## Features

### Workspace Sessions

See active and historical Claude sessions grouped by workspace, with session state and transcript context.

### Diffs / Files Changed

Inspect what changed in your working tree, including per-turn diffs and changed files tied to your current flow.

### Git History

Browse branch history and inspect commit-level diffs from inside the same workspace view.

## Need Development Setup?

If you want to run from source, build, or contribute, use:

- `DEVELOPER.md`
