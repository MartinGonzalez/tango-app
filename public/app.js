const processGrid = document.querySelector("#processGrid");
const processCount = document.querySelector("#processCount");
const taskCount = document.querySelector("#taskCount");
const eventCount = document.querySelector("#eventCount");
const lastUpdated = document.querySelector("#lastUpdated");
const statusFilter = document.querySelector("#statusFilter");
const commandFilter = document.querySelector("#commandFilter");

const ACTIVITY_LABELS = {
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
  waiting_for_input: "Waiting for input",
  finished: "Finished"
};

const SHIMMER_COLORS = [
  { base: "#ef4444", light: "#fca5a5" },
  { base: "#a855f7", light: "#d8b4fe" },
  { base: "#f59e0b", light: "#fcd34d" },
  { base: "#3b82f6", light: "#93c5fd" },
  { base: "#10b981", light: "#6ee7b7" }
];

let latestData = { processes: [], tasks: [], eventCount: 0, timestamp: null };

statusFilter.addEventListener("change", render);
commandFilter.addEventListener("input", render);

void refresh();
setInterval(refresh, 2000);

async function refresh() {
  try {
    const response = await fetch("/api/snapshot");
    if (!response.ok) {
      throw new Error(`Snapshot request failed: ${response.status}`);
    }
    latestData = await response.json();
    render();
  } catch (error) {
    lastUpdated.textContent = `Snapshot error: ${error.message}`;
  }
}

function render() {
  processCount.textContent = String(latestData.processes.length);
  taskCount.textContent = String(latestData.tasks.length);
  eventCount.textContent = String(latestData.eventCount ?? 0);
  lastUpdated.textContent = latestData.timestamp
    ? `Last updated ${new Date(latestData.timestamp).toLocaleTimeString()}`
    : "Waiting for first sample...";

  const statusValue = statusFilter.value;
  const commandValue = commandFilter.value.trim().toLowerCase();

  const filtered = latestData.processes.filter((process) => {
    if (statusValue !== "all" && process.state !== statusValue) {
      return false;
    }
    if (!commandValue) {
      return true;
    }
    const taskText = process.task ? `${process.task.title} ${process.task.cwd ?? ""}` : "";
    return `${process.command} ${taskText}`.toLowerCase().includes(commandValue);
  });

  reconcileGrid(filtered, latestData.subagents ?? []);
}

function reconcileGrid(filtered, subagents) {
  if (filtered.length === 0) {
    processGrid.innerHTML = `<div class="empty">No matching Claude process right now.</div>`;
    return;
  }

  const emptyDiv = processGrid.querySelector(".empty");
  if (emptyDiv) emptyDiv.remove();

  const activePids = new Set(filtered.map((p) => String(p.pid)));

  for (const card of [...processGrid.querySelectorAll("[data-pid]")]) {
    if (!activePids.has(card.dataset.pid)) {
      card.remove();
    }
  }

  for (const process of filtered) {
    const pid = String(process.pid);
    let card = processGrid.querySelector(`[data-pid="${pid}"]`);

    if (!card) {
      card = createCard(pid);
      processGrid.appendChild(card);
    }

    // Find subagents for this process's session
    const processSubagents = process.task
      ? subagents.filter(sub => sub.parentSessionId === process.task.sessionId)
      : [];

    patchCard(card, process, processSubagents);
  }
}

function createCard(pid) {
  const card = document.createElement("article");
  card.className = "process-card";
  card.dataset.pid = pid;
  card.style.cursor = "pointer";
  card.addEventListener("click", (e) => {
    if (e.target.closest("details, summary, a, button, input, select")) return;
    const appName = card.dataset.appName;
    if (appName && appName !== "Claude CLI") {
      fetch("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName })
      });
    }
  });
  card.innerHTML = `
    <div class="app-name" data-field="app-name"></div>
    <div class="card-header">
      <span class="activity-dot"></span>
      <strong data-field="topic"></strong>
    </div>
    <div class="status-row">
      <span class="badge activity" data-field="activity-label"></span>
    </div>
    <span class="current-tool" data-field="current-tool"></span>
    <hr class="card-divider" data-field="divider-1" hidden>
    <div class="subagents-section" data-field="subagents-section" hidden>
      <div class="section-label">Sub-Agents</div>
      <div class="subagents-list" data-field="subagents-list"></div>
    </div>
    <hr class="card-divider" data-field="divider-2" hidden>
    <div class="context-usage" data-field="context-usage">
      <div class="context-bar">
        <div class="context-bar-fill" data-field="context-bar-fill"></div>
      </div>
      <div class="context-text" data-field="context-text"></div>
    </div>
    <div class="extra-info" data-field="extra-info"></div>
    <details class="process-stats" data-field="process-stats">
      <summary class="stats-summary">Process Details</summary>
      <div class="stats-content">
        <div class="muted" data-field="cwd"></div>
        <div class="muted" data-field="stats"></div>
        <div class="muted" data-field="model"></div>
        <div class="muted" data-field="session"></div>
      </div>
    </details>
    <div class="task muted" data-field="no-task">No hook data</div>`;
  return card;
}

function patchCard(card, process, subagents) {
  card.dataset.appName = process.appName ?? "";
  const task = process.task;
  const activity = process.activity ?? "unknown";

  // Detect transition from working to finished
  const prevActivity = card.dataset.activity;
  const wasWorking = prevActivity === "working";
  const isNowFinished = activity === "finished";

  if (wasWorking && isNowFinished) {
    card.dataset.finished = "true";
    card.classList.add("blink-finished");
    card.addEventListener("animationend", () => {
      card.classList.remove("blink-finished");
    }, { once: true });
  } else if (activity === "working" || activity === "waiting_for_input") {
    card.dataset.finished = "false";
  }
  card.dataset.activity = activity;

  // Update app name and finished badge
  const appNameEl = card.querySelector('[data-field="app-name"]');
  const appNameText = process.appName ?? "Claude";
  const existingBadge = appNameEl.querySelector('.finished-badge');

  // Clear and rebuild app name content
  appNameEl.textContent = appNameText;

  // Add finished badge if task just finished
  if (card.dataset.finished === "true" && activity === "finished") {
    if (!existingBadge) {
      const badge = document.createElement('span');
      badge.className = 'finished-badge';
      badge.title = 'Task finished';
      appNameEl.appendChild(badge);
    }
  }

  const dot = card.querySelector(".activity-dot");
  const dotModifier = activity === "working" ? " working" : activity === "waiting_for_input" ? " waiting-for-input" : "";
  dot.className = "activity-dot" + dotModifier;

  card.querySelector('[data-field="topic"]').textContent =
    task?.topic ?? task?.prompt ?? (task ? "Claude session" : "PID " + process.pid);

  const activityBadge = card.querySelector('[data-field="activity-label"]');
  activityBadge.textContent = ACTIVITY_LABELS[activity] ?? "No hook data";
  activityBadge.className = `badge activity activity-${activity}`;

  // Current tool — shows PreToolUse label, clears on Stop
  const currentToolEl = card.querySelector('[data-field="current-tool"]');
  const toolLabel = task?.currentToolLabel ?? "";
  if (toolLabel) {
    const prevLabel = card.dataset.toolLabel;
    if (prevLabel !== toolLabel) {
      card.dataset.toolLabel = toolLabel;
      const color = SHIMMER_COLORS[Math.floor(Math.random() * SHIMMER_COLORS.length)];
      currentToolEl.style.setProperty("--shimmer-base", color.base);
      currentToolEl.style.setProperty("--shimmer-light", color.light);
      currentToolEl.classList.remove("shimmer");
      void currentToolEl.offsetWidth;
      currentToolEl.classList.add("shimmer");
    }
    currentToolEl.textContent = toolLabel;
    currentToolEl.hidden = false;
  } else {
    currentToolEl.hidden = true;
    currentToolEl.textContent = "";
    currentToolEl.classList.remove("shimmer");
    card.dataset.toolLabel = "";
  }

  // Render subagents section
  const subagentsSection = card.querySelector('[data-field="subagents-section"]');
  const subagentsList = card.querySelector('[data-field="subagents-list"]');
  const divider1 = card.querySelector('[data-field="divider-1"]');
  const divider2 = card.querySelector('[data-field="divider-2"]');

  if (subagents.length > 0) {
    reconcileSubagents(subagentsList, subagents);
    subagentsSection.hidden = false;
    divider1.hidden = false;
    divider2.hidden = false;
  } else {
    subagentsSection.hidden = true;
    divider1.hidden = true;
    divider2.hidden = true;
  }

  // Context usage - use what Claude provides
  const contextUsageEl = card.querySelector('[data-field="context-usage"]');
  const contextPercentage = task?.contextPercentage;

  if (contextPercentage != null) {
    const barFill = card.querySelector('[data-field="context-bar-fill"]');
    barFill.style.width = `${contextPercentage}%`;
    barFill.className = `context-bar-fill context-${getContextLevel(contextPercentage)}`;

    card.querySelector('[data-field="context-text"]').textContent =
      `Context: ${contextPercentage.toFixed(1)}%`;

    contextUsageEl.hidden = false;
  } else {
    contextUsageEl.hidden = true;
  }

  const extraInfoEl = card.querySelector('[data-field="extra-info"]');
  if (task?.lastNotes) {
    extraInfoEl.textContent = task.lastNotes;
    extraInfoEl.hidden = false;
  } else {
    extraInfoEl.hidden = true;
  }

  card.querySelector('[data-field="stats"]').textContent =
    `PID ${process.pid} · CPU ${process.cpu}% · MEM ${process.mem}% · uptime ${process.elapsed}`;

  card.querySelector('[data-field="model"]').textContent = task?.model
    ? `model ${formatModelName(task.model)}`
    : "";

  card.querySelector('[data-field="session"]').textContent = task
    ? `session ${task.sessionId.slice(0, 8)}...`
    : "";

  card.querySelector('[data-field="cwd"]').textContent = task?.cwd
    ? `📁 ${task.cwd}`
    : "";

  const processStats = card.querySelector('[data-field="process-stats"]');
  const noTask = card.querySelector('[data-field="no-task"]');

  if (task) {
    processStats.hidden = false;
    noTask.hidden = true;
  } else {
    processStats.hidden = true;
    noTask.hidden = false;
  }
}

function getContextLevel(percentage) {
  if (percentage >= 80) return "high";
  if (percentage >= 50) return "medium";
  return "low";
}

function formatModelName(model) {
  // Convert model IDs to friendly names
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  if (model.includes('opus')) return 'Opus 4.6';
  if (model.includes('haiku')) return 'Haiku 4.5';
  return model; // fallback to original
}

function formatDuration(startedAt) {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ── Sub-agent component ──────────────────────────────────────────

function reconcileSubagents(container, subagents) {
  const activeIds = new Set(subagents.map(s => s.agentId));

  // Remove stale subagent components
  for (const el of [...container.querySelectorAll("[data-agent-id]")]) {
    if (!activeIds.has(el.dataset.agentId)) {
      el.remove();
    }
  }

  // Create or update each subagent component
  for (const sub of subagents) {
    let el = container.querySelector(`[data-agent-id="${sub.agentId}"]`);
    if (!el) {
      el = createSubagentComponent(sub);
      container.appendChild(el);
    }
    patchSubagentComponent(el, sub);
  }
}

function createSubagentComponent(sub) {
  const el = document.createElement("div");
  el.className = "subagent-component";
  el.dataset.agentId = sub.agentId;
  el.innerHTML = `
    <div class="subagent-comp-header">
      <span class="subagent-comp-badge" data-field="sa-badge"></span>
      <span class="subagent-comp-id" data-field="sa-id"></span>
      <span class="subagent-comp-duration" data-field="sa-duration"></span>
    </div>
    <div class="subagent-comp-desc" data-field="sa-desc"></div>
    <div class="subagent-comp-toolbox" data-field="sa-toolbox">
      <div class="subagent-toolbox-header">Tools</div>
      <div class="subagent-toolbox-list" data-field="sa-tool-list"></div>
    </div>`;
  return el;
}

function patchSubagentComponent(el, sub) {
  el.querySelector('[data-field="sa-badge"]').textContent = sub.agentType || "Agent";
  el.querySelector('[data-field="sa-id"]').textContent = sub.agentId.slice(0, 8);
  el.querySelector('[data-field="sa-desc"]').textContent = sub.description || "Running...";

  if (sub.startedAt) {
    el.querySelector('[data-field="sa-duration"]').textContent = formatDuration(sub.startedAt);
  }

  const toolbox = el.querySelector('[data-field="sa-toolbox"]');
  const toolList = el.querySelector('[data-field="sa-tool-list"]');
  const history = sub.toolHistory ?? [];

  if (history.length === 0 && !sub.currentTool) {
    toolbox.hidden = true;
    return;
  }
  toolbox.hidden = false;

  // Show last 8 tool calls from history
  const recentTools = history.slice(-8);
  const prevCount = toolList.children.length;

  toolList.innerHTML = recentTools.map((entry, i) => {
    const isLast = i === recentTools.length - 1;
    const prefix = isLast ? "▸" : "·";
    const activeClass = isLast ? " active" : "";
    return `<div class="subagent-tool-entry${activeClass}">${prefix} ${entry.tool}</div>`;
  }).join("");

  // Animate new entries
  if (toolList.children.length > prevCount) {
    const lastChild = toolList.lastElementChild;
    if (lastChild) lastChild.classList.add("tool-entry-new");
  }
}
