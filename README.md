# Tango

Tango is a desktop app for managing Claude Code sessions. It lets you spawn, monitor, and interact with Claude across multiple projects from a single native interface.

Built with [Electrobun](https://electrobun.dev) (Bun + native WebKit).

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/MartinGonzalez/tango-app/main/scripts/install.sh | bash
```

This downloads the latest release, unzips it, and moves the app to `/Applications`.

### Manual

1. Go to [Releases](https://github.com/MartinGonzalez/tango-app/releases)
2. Download `Tango-macos-arm64.zip` from the latest release
3. Unzip and move `Tango-dev.app` to `/Applications`
4. Right-click the app → **Open** (required on first launch since the app is unsigned)

### Requirements

- macOS (Apple Silicon)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and working (`claude` command)

## Features

- **Session management** — Spawn and manage Claude Code sessions with interactive chat
- **Live streaming** — See Claude's output in real-time as it works
- **Tool approval** — Allow/Deny dialogs for Write, Bash, and other tool calls
- **Multi-stage** — Open multiple project folders and switch between them
- **Diff viewer** — Inspect file changes with unified/split modes (git and snapshot-based)
- **Git history** — Browse branch history and commit diffs
- **Instruments** — Extend Tango with plugins for custom panels, backend actions, and integrations
- **Debug console** — Built-in log viewer (Cmd+L) for instrument debugging

## Instruments

Tango supports instruments — plugins that add custom functionality. Each instrument can render panels, run backend logic, persist data, and react to host events.

- [Instrument docs](https://martingonzalez.github.io/tango-app/)
- [Create an instrument](https://martingonzalez.github.io/tango-app/getting-started/installation/)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New session |
| `Cmd+O` | Open stage |
| `Cmd+1` | Toggle sidebar |
| `Cmd+2` | Toggle second panel |
| `Cmd+4` | Toggle files changed |
| `Cmd+5` | Toggle git history |
| `Cmd+L` | Toggle debug console |

## Development

```bash
cd desktop
bun install
bun run dev        # Build instruments + build app + run
```

See `CLAUDE.md` for detailed architecture and development docs.
