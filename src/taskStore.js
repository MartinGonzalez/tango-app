const DEFAULT_STATUS = "waiting";
const DEFAULT_IDLE_THRESHOLD_MS = 20_000;

export class TaskStore {
  #tasksBySession = new Map();
  #events = [];
  #activeSubagents = new Map(); // sessionId -> subagent info
  #maxEvents;
  #idleThresholdMs;

  constructor({ maxEvents = 1000, idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS } = {}) {
    this.#maxEvents = maxEvents;
    this.#idleThresholdMs = idleThresholdMs;
  }

  ingest(rawEvent) {
    const event = normalizeIncomingEvent(rawEvent);

    // Handle subagent tracking events
    if (event.type === "subagent-start") {
      this.trackSubagent(event.agentId, event.sessionId, event.agentType, event.description);
      return; // Don't process as regular task event
    } else if (event.type === "subagent-stop") {
      this.removeSubagent(event.agentId);
      return; // Don't process as regular task event
    } else if (event.type === "subagent-session-link") {
      this.linkSubagentSession(event.agentId, event.subagentSessionId);
      return; // Don't process as regular task event
    }

    // Check if this event is from a subagent session (not a main task)
    // If so, ONLY update the subagent, don't process as main task event
    if (event.sessionId && this.isSubagentSession(event.sessionId)) {
      if (event.currentTool) {
        this.updateSubagentTool(event.sessionId, event.currentTool);
      }
      return; // Don't process subagent events as main task events
    }

    validateEvent(event);

    const at = event.at ?? new Date().toISOString();
    const normalized = { ...event, at };
    this.#events.push(normalized);
    if (this.#events.length > this.#maxEvents) {
      this.#events.shift();
    }

    const current = this.#tasksBySession.get(event.sessionId);
    if (event.type === "task-start") {
      this.#tasksBySession.set(event.sessionId, {
        sessionId: event.sessionId,
        pid: event.pid ?? null,
        title: event.title ?? "Untitled task",
        cwd: event.cwd ?? null,
        status: event.status ?? DEFAULT_STATUS,
        startedAt: at,
        updatedAt: at,
        endedAt: null,
        lastNotes: event.notes ?? "",
        transcriptPath: event.transcriptPath ?? null,
        prompt: null,
        topic: null,
        contextPercentage: event.contextPercentage ?? null,
        model: event.model ?? null,
        currentTool: null,
        currentToolLabel: null
      });
      return;
    }

    if (!current) {
      throw new Error(`No task-start found for sessionId '${event.sessionId}'`);
    }

    if (event.type === "task-update") {
      let newTool = current.currentTool;
      let currentToolLabel = current.currentToolLabel;

      if ("currentTool" in event) {
        newTool = event.currentTool;
        // truthy = PreToolUse set a tool, capture the label
        // null = PostToolUse/Stop cleared it, wipe the label
        currentToolLabel = event.currentTool
          ? (event.title ?? event.currentTool)
          : null;
      }

      this.#tasksBySession.set(event.sessionId, {
        ...current,
        status: event.status ?? current.status,
        title: event.title ?? current.title,
        cwd: event.cwd ?? current.cwd,
        pid: event.pid ?? current.pid,
        updatedAt: at,
        lastNotes: event.notes ?? current.lastNotes,
        transcriptPath: event.transcriptPath ?? current.transcriptPath,
        contextPercentage: event.contextPercentage ?? current.contextPercentage,
        model: event.model ?? current.model,
        currentTool: newTool,
        currentToolLabel
      });
      return;
    }

    if (event.type === "task-end") {
      this.#tasksBySession.set(event.sessionId, {
        ...current,
        status: event.status ?? "completed",
        updatedAt: at,
        endedAt: at,
        lastNotes: event.notes ?? current.lastNotes
      });
    }
  }

  snapshot() {
    const tasks = Array.from(this.#tasksBySession.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    const subagents = Array.from(this.#activeSubagents.values());
    return {
      tasks,
      subagents,
      events: [...this.#events]
    };
  }

  trackSubagent(agentId, parentSessionId, agentType, description) {
    this.#activeSubagents.set(agentId, {
      agentId,
      parentSessionId,
      agentType,
      description: description || null,
      currentTool: null,
      toolHistory: [],
      subagentSessionId: null,
      startedAt: new Date().toISOString()
    });
  }

  linkSubagentSession(agentId, subagentSessionId) {
    const subagent = this.#activeSubagents.get(agentId);
    if (subagent) {
      subagent.subagentSessionId = subagentSessionId;
    }
  }

  isSubagentSession(sessionId) {
    // Check if this session ID belongs to any active subagent
    for (const subagent of this.#activeSubagents.values()) {
      if (subagent.subagentSessionId === sessionId) {
        return true;
      }
    }
    return false;
  }

  updateSubagentTool(subagentSessionId, currentTool) {
    for (const subagent of this.#activeSubagents.values()) {
      if (subagent.subagentSessionId === subagentSessionId) {
        subagent.currentTool = currentTool;
        subagent.toolHistory.push({ tool: currentTool, at: new Date().toISOString() });
        if (subagent.toolHistory.length > 20) {
          subagent.toolHistory.shift();
        }
        break;
      }
    }
  }

  removeSubagent(agentId) {
    this.#activeSubagents.delete(agentId);
  }

  taskByPid(pid) {
    const pidTasks = Array.from(this.#tasksBySession.values())
      .filter((task) => task.pid === pid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return pidTasks[0] ?? null;
  }

  setPrompt(sessionId, prompt, topic) {
    const task = this.#tasksBySession.get(sessionId);
    if (!task) return false;
    if (task.prompt) return false; // don't overwrite
    task.prompt = prompt;
    task.topic = topic;
    return true;
  }

  taskForProcess(process, { now = new Date().toISOString() } = {}) {
    const exact = this.taskByPid(process.pid);
    if (exact) {
      return {
        task: exact,
        attribution: "pid",
        activity: deriveActivity(exact, process, now, this.#idleThresholdMs)
      };
    }

    const activeTasks = Array.from(this.#tasksBySession.values())
      .filter((task) => task.endedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (activeTasks.length === 1) {
      return {
        task: activeTasks[0],
        attribution: "single-active",
        activity: deriveActivity(activeTasks[0], process, now, this.#idleThresholdMs)
      };
    }

    return {
      task: null,
      attribution: "none",
      activity: deriveActivity(null, process, now, this.#idleThresholdMs)
    };
  }
}

export function normalizeIncomingEvent(event) {
  if (!event || typeof event !== "object") {
    return event;
  }

  const normalized = { ...event };
  normalized.sessionId = event.sessionId ?? event.session_id;
  normalized.pid = asNumber(event.pid ?? event.processId ?? event.process_id);
  normalized.title =
    event.title ??
    event.currentTask ??
    event.current_task ??
    event.task ??
    event.task_title;
  normalized.transcriptPath = event.transcriptPath ?? event.transcript_path;
  normalized.contextPercentage = asNumber(event.contextPercentage ?? event.context_percentage);
  normalized.agentId = event.agentId ?? event.agent_id;
  normalized.agentType = event.agentType ?? event.agent_type;
  normalized.currentTool = event.currentTool ?? event.current_tool;
  normalized.description = event.description;
  normalized.subagentSessionId = event.subagentSessionId ?? event.subagent_session_id;

  return normalized;
}

function validateEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Event must be an object");
  }
  if (!event.sessionId) {
    throw new Error("Event must include sessionId");
  }
  if (!["task-start", "task-update", "task-end"].includes(event.type)) {
    throw new Error("Event type must be one of task-start, task-update, task-end");
  }
}

function asNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function deriveActivity(task, process, nowIso, idleThresholdMs) {
  if (!task) {
    return "idle";
  }

  // Check if task has ended
  if (task.endedAt) {
    return "finished";
  }

  if (["completed", "error", "cancelled"].includes(task.status)) {
    return "finished";
  }

  // Status-based decisions take priority over staleness.
  // During thinking, no hooks fire — but "running" means Claude is working.
  if (task.status === "waiting_for_input") {
    return "waiting_for_input";
  }

  if (task.status === "running") {
    return "working";
  }

  if (task.status === "waiting") {
    return "waiting";
  }

  // Staleness only applies when status is ambiguous
  const now = new Date(nowIso).getTime();
  const updatedAt = new Date(task.updatedAt).getTime();
  const stale = now - updatedAt > idleThresholdMs;

  if (stale) {
    return "idle";
  }

  return "idle";
}
