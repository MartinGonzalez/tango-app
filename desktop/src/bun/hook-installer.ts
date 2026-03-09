/**
 * Auto-installs Tango hooks into the user's global Claude settings.
 *
 * Two hook scripts are installed to ~/.tango/hooks/:
 *   1. pre-tool-use.sh  — PreToolUse approval hook (blocks until user allows/denies in Tango UI)
 *   2. on-hook.sh       — Event forwarder (fire-and-forget, sends every hook event to the watcher + desktop app)
 *
 * Both are registered in ~/.claude/settings.json so they fire for ALL Claude sessions on the machine.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const TANGO_HOOKS_DIR = join(homedir(), ".tango", "hooks");
const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

// ── Hook script names ────────────────────────────────────────────

const APPROVAL_HOOK_NAME = "pre-tool-use.sh";
const EVENT_HOOK_NAME = "on-hook.sh";

// ── Hook event types the event forwarder should listen to ────────

const EVENT_FORWARDER_HOOK_TYPES = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCompleted",
] as const;

// ── Script contents ──────────────────────────────────────────────

const APPROVAL_HOOK_SCRIPT = `#!/bin/bash
# PreToolUse hook for Tango app.
# Blocks until the user approves/denies the tool in the app UI.
# Falls back to allowing if the app is not running or session is not app-managed.

INPUT=$(cat)
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# No tool use ID → allow
if [ -z "$TOOL_USE_ID" ]; then
  exit 0
fi

APPROVAL_PORT="\${CLAUDE_APPROVAL_PORT:-4243}"

# Quick check: is the app server even running?
if ! curl -sf --max-time 0.5 "http://localhost:\$APPROVAL_PORT/api/ping" >/dev/null 2>&1; then
  # App not running → allow
  exit 0
fi

# POST to approval server and wait (long-poll, max 120s)
RESPONSE=$(curl -sf --max-time 120 -X POST "http://localhost:$APPROVAL_PORT/api/tool-approve" \\
  -H "Content-Type: application/json" \\
  -d "{\\"tool_use_id\\": \\"$TOOL_USE_ID\\", \\"tool_name\\": \\"$TOOL_NAME\\", \\"tool_input\\": $TOOL_INPUT, \\"session_id\\": \\"$SESSION_ID\\"}" 2>/dev/null)

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
`;

const EVENT_HOOK_SCRIPT = `#!/bin/bash
# Tango event forwarder — sends every Claude hook event to the watcher server and desktop app.
# Fire-and-forget: never blocks Claude, exits immediately.

INPUT=$(cat)
WATCHER_URL="\${CLAUDE_WATCHER_URL:-http://localhost:4242}"
APPROVAL_PORT="\${CLAUDE_APPROVAL_PORT:-4243}"
PAYLOAD=$(echo "$INPUT" | jq -c ". + {process_id: $PPID}")

# Send to watcher server
curl -s -X POST "$WATCHER_URL/api/events" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" > /dev/null 2>&1

# Send to desktop app (fire-and-forget for diff/stage refresh)
curl -s --max-time 0.5 -X POST "http://localhost:$APPROVAL_PORT/api/hook-event" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" > /dev/null 2>&1 &

exit 0
`;

// ── Public API ───────────────────────────────────────────────────

/**
 * Install all Tango hooks globally.
 * - Writes hook scripts to ~/.tango/hooks/
 * - Ensures ~/.claude/ directory exists
 * - Registers hooks in ~/.claude/settings.json
 */
export async function installApprovalHook(): Promise<string> {
  // Ensure both directories exist
  await mkdir(TANGO_HOOKS_DIR, { recursive: true });
  await mkdir(CLAUDE_DIR, { recursive: true });

  const approvalPath = join(TANGO_HOOKS_DIR, APPROVAL_HOOK_NAME);
  const eventPath = join(TANGO_HOOKS_DIR, EVENT_HOOK_NAME);

  // Write both hook scripts
  await writeFile(approvalPath, APPROVAL_HOOK_SCRIPT, { mode: 0o755 });
  await writeFile(eventPath, EVENT_HOOK_SCRIPT, { mode: 0o755 });

  // Register in Claude settings
  await registerHooksInSettings(approvalPath, eventPath);

  console.log(`Tango hooks installed: ${approvalPath}, ${eventPath}`);
  return approvalPath;
}

// ── Settings registration ────────────────────────────────────────

async function registerHooksInSettings(
  approvalPath: string,
  eventPath: string
): Promise<void> {
  let settings: Record<string, any> = {};

  try {
    const content = await readFile(CLAUDE_SETTINGS_PATH, "utf-8");
    settings = JSON.parse(content);
  } catch {
    // No settings file yet — start fresh
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  let changed = false;

  // 1. Register approval hook for PreToolUse
  changed = ensureHookRegistered(settings, "PreToolUse", approvalPath, APPROVAL_HOOK_NAME) || changed;

  // 2. Register event forwarder for all relevant hook types
  for (const hookType of EVENT_FORWARDER_HOOK_TYPES) {
    changed = ensureHookRegistered(settings, hookType, eventPath, EVENT_HOOK_NAME) || changed;
  }

  if (changed) {
    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    console.log("Updated Claude settings with Tango hooks");
  } else {
    console.log("All Tango hooks already registered in Claude settings");
  }
}

/**
 * Ensures a hook script is registered under the given hook type.
 * Returns true if a new entry was added.
 */
function ensureHookRegistered(
  settings: Record<string, any>,
  hookType: string,
  hookPath: string,
  scriptName: string
): boolean {
  if (!settings.hooks[hookType]) {
    settings.hooks[hookType] = [];
  }

  const hookGroups = settings.hooks[hookType] as any[];
  const alreadyInstalled = hookGroups.some((group: any) =>
    group?.hooks?.some((h: any) => h.command?.includes(scriptName))
  );

  if (alreadyInstalled) {
    return false;
  }

  hookGroups.push({
    hooks: [
      {
        type: "command",
        command: hookPath,
      },
    ],
  });

  return true;
}
