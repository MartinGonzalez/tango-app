import path from "node:path";

/**
 * Transforms a raw Claude Code hook payload into TaskStore events and notifications.
 * Pure function — no state, no I/O.
 */
export function processHookEvent(raw) {
  const hookName = raw.hook_event_name;
  const sessionId = raw.session_id;
  const pid = raw.process_id ?? null;
  const cwd = raw.cwd ?? null;
  const transcriptPath = raw.transcript_path ?? null;
  const contextPercentage = raw.context_percentage ?? null;
  const model = raw.model ?? null;
  const projectName = cwd ? path.basename(cwd) : "Claude";

  const base = { sessionId, pid, cwd, transcriptPath, contextPercentage };

  const events = [];
  const notifications = [];

  switch (hookName) {
    case "SessionStart": {
      const source = raw.source ?? "startup";
      events.push({
        ...base,
        type: "task-start",
        status: "waiting",
        title: `Session started (${source})`,
        model
      });
      break;
    }

    case "UserPromptSubmit": {
      events.push({
        ...base,
        type: "task-update",
        status: "running",
        title: "Processing prompt"
      });
      break;
    }

    case "PreToolUse": {
      const toolName = raw.tool_name ?? "unknown";
      const toolInput = raw.tool_input;

      if (toolName === "Task") {
        events.push({
          type: "subagent-start",
          agentId: raw.tool_use_id,
          sessionId,
          agentType: toolInput?.subagent_type ?? "unknown",
          description: toolInput?.description ?? toolInput?.prompt ?? null
        });
      }

      events.push({
        ...base,
        type: "task-update",
        status: "running",
        title: generateToolLabel(toolName, toolInput),
        currentTool: toolName
      });
      break;
    }

    case "PostToolUse": {
      const toolName = raw.tool_name ?? "unknown";

      if (toolName === "Task") {
        events.push({
          type: "subagent-stop",
          agentId: raw.tool_use_id,
          sessionId
        });
      }

      events.push({
        ...base,
        type: "task-update",
        status: "running",
        title: `Completed: ${toolName}`,
        currentTool: null
      });
      break;
    }

    case "PostToolUseFailure": {
      const toolName = raw.tool_name ?? "unknown";
      events.push({
        ...base,
        type: "task-update",
        status: "error",
        title: `Error: ${toolName} failed`
      });
      break;
    }

    case "Notification": {
      const notifType = raw.notification_type ?? "";
      const needsInput = notifType === "permission_prompt" || notifType === "elicitation_dialog";

      if (needsInput) {
        events.push({
          ...base,
          type: "task-update",
          status: "waiting_for_input",
          title: "Waiting for input"
        });
        notifications.push({
          title: projectName,
          message: "Claude requires your input"
        });
      }
      // idle_prompt / auth_success — don't change state, just ignore
      break;
    }

    case "PermissionRequest": {
      events.push({
        ...base,
        type: "task-update",
        status: "waiting_for_input",
        title: "Waiting for permission"
      });
      notifications.push({
        title: projectName,
        message: "Permission required"
      });
      break;
    }

    case "SubagentStart": {
      events.push({
        type: "subagent-session-link",
        subagentSessionId: sessionId,
        agentId: raw.agent_id,
        agentType: raw.agent_type ?? "unknown"
      });
      break;
    }

    case "SubagentStop": {
      events.push({
        type: "subagent-stop",
        agentId: raw.agent_id,
        sessionId
      });
      break;
    }

    case "TaskCompleted": {
      events.push({
        ...base,
        type: "task-update",
        status: "completed",
        title: "Task completed"
      });
      notifications.push({
        title: projectName,
        message: "Task completed successfully"
      });
      break;
    }

    case "Stop": {
      events.push({
        ...base,
        type: "task-update",
        status: "waiting",
        title: "Finished responding",
        currentTool: null
      });
      notifications.push({
        title: projectName,
        message: "Claude finished working"
      });
      break;
    }

    case "SessionEnd": {
      events.push({
        ...base,
        type: "task-end",
        status: "completed"
      });
      break;
    }

    // Unknown events are silently ignored
  }

  return { events, notifications };
}

/**
 * Generates a human-readable label for a tool invocation.
 */
export function generateToolLabel(toolName, toolInput) {
  const input = toolInput ?? {};

  switch (toolName) {
    case "Bash": {
      const cmd = (input.command ?? "").slice(0, 120);
      return `Running: ${cmd}`;
    }
    case "Edit":
      return `Editing ${basename(input.file_path)}`;
    case "Write":
      return `Writing ${basename(input.file_path)}`;
    case "Read":
      return `Reading ${basename(input.file_path)}`;
    case "Glob":
      return `Searching files: ${input.pattern ?? ""}`;
    case "Grep":
      return `Searching code: ${input.pattern ?? ""}`;
    case "WebFetch":
      return `Fetching ${input.url ?? ""}`;
    case "Task":
      return "Task";
    default:
      return `Using ${toolName}`;
  }
}

function basename(filePath) {
  if (!filePath) return "";
  return path.basename(filePath);
}
