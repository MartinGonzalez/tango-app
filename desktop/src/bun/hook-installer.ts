/**
 * Auto-installs the PreToolUse approval hook into the user's Claude settings.
 * Writes the hook script to ~/.tango/hooks/ and adds a reference
 * in ~/.claude/settings.json (alongside any existing hooks).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const HOOKS_DIR = join(homedir(), ".tango", "hooks");
const HOOK_SCRIPT_NAME = "pre-tool-use.sh";
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

const HOOK_SCRIPT = `#!/bin/bash
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

/**
 * Install the pre-tool-use hook if not already installed.
 * Returns the absolute path to the installed hook script.
 */
export async function installApprovalHook(): Promise<string> {
  const destPath = join(HOOKS_DIR, HOOK_SCRIPT_NAME);

  // Ensure hooks directory exists
  await mkdir(HOOKS_DIR, { recursive: true });

  // Write hook script
  await writeFile(destPath, HOOK_SCRIPT, { mode: 0o755 });

  // Add to Claude settings
  await addHookToSettings(destPath);

  console.log(`Approval hook installed: ${destPath}`);
  return destPath;
}

async function addHookToSettings(hookPath: string): Promise<void> {
  let settings: Record<string, any> = {};

  try {
    const content = await readFile(CLAUDE_SETTINGS_PATH, "utf-8");
    settings = JSON.parse(content);
  } catch {
    // No settings file yet
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  // Check if our hook is already installed
  const hookGroups = settings.hooks.PreToolUse as any[];
  const alreadyInstalled = hookGroups.some((group: any) =>
    group?.hooks?.some((h: any) => h.command?.includes(HOOK_SCRIPT_NAME))
  );

  if (alreadyInstalled) {
    console.log("Approval hook already in Claude settings");
    return;
  }

  // Add our hook as a new entry in PreToolUse
  hookGroups.push({
    hooks: [
      {
        type: "command",
        command: hookPath,
      },
    ],
  });

  await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  console.log("Added approval hook to Claude settings");
}
