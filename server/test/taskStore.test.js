import test from "node:test";
import assert from "node:assert/strict";

import { TaskStore, normalizeIncomingEvent } from "../src/taskStore.js";

test("TaskStore creates and updates a task lifecycle", () => {
  const store = new TaskStore();

  store.ingest({
    type: "task-start",
    sessionId: "s1",
    pid: 900,
    title: "Investigate failing tests",
    cwd: "/tmp/repo",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-update",
    sessionId: "s1",
    status: "running",
    notes: "Scanning files",
    at: "2026-02-16T10:01:00.000Z"
  });

  store.ingest({
    type: "task-end",
    sessionId: "s1",
    status: "completed",
    at: "2026-02-16T10:05:00.000Z"
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].status, "completed");
  assert.equal(snapshot.tasks[0].lastNotes, "Scanning files");
  assert.equal(snapshot.tasks[0].endedAt, "2026-02-16T10:05:00.000Z");
});

test("TaskStore rejects events missing sessionId", () => {
  const store = new TaskStore();

  assert.throws(() => {
    store.ingest({ type: "task-start", title: "No session" });
  }, /sessionId/);
});

test("normalizeIncomingEvent maps hook-style snake_case payload", () => {
  const normalized = normalizeIncomingEvent({
    type: "task-update",
    session_id: "hook-session",
    process_id: 8181,
    current_task: "Analyze logs"
  });

  assert.equal(normalized.sessionId, "hook-session");
  assert.equal(normalized.pid, 8181);
  assert.equal(normalized.title, "Analyze logs");
});

test("taskForProcess links by single active task when pid is missing", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "solo",
    title: "Only active task",
    cwd: "/repo",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  const linked = store.taskForProcess({
    pid: 9000,
    command: "/opt/homebrew/bin/claude",
    state: "sleeping"
  });

  assert.equal(linked.task?.sessionId, "solo");
  assert.equal(linked.attribution, "single-active");
});

test("taskForProcess reports working when running task has no recent updates (thinking)", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "idle-session",
    pid: 500,
    title: "Waiting for input",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 500, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:30.000Z" }
  );

  assert.equal(linked.activity, "working");
});

test("deriveActivity: sleeping process with recent running task shows working", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "active-hook",
    pid: 600,
    title: "Editing file",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-update",
    sessionId: "active-hook",
    status: "running",
    notes: "Using Edit on src/app.js",
    at: "2026-02-16T10:00:02.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 600, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:03.000Z" }
  );

  assert.equal(linked.activity, "working", "task status 'running' should map to 'working' activity");
});

test("deriveActivity: sleeping process with recent waiting task shows waiting", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "wait-hook",
    pid: 700,
    title: "Session started",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-update",
    sessionId: "wait-hook",
    status: "waiting",
    notes: "Claude stopped, awaiting input",
    at: "2026-02-16T10:00:05.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 700, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:06.000Z" }
  );

  assert.equal(linked.activity, "waiting", "task status 'waiting' should show waiting");
});

test("deriveActivity: no task linked to process falls back to idle", () => {
  const store = new TaskStore();

  const linked = store.taskForProcess(
    { pid: 999, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:00.000Z" }
  );

  assert.equal(linked.task, null);
  assert.equal(linked.activity, "idle");
});

test("normalizeIncomingEvent maps transcript_path to transcriptPath", () => {
  const normalized = normalizeIncomingEvent({
    type: "task-start",
    session_id: "t1",
    transcript_path: "/home/user/.claude/projects/abc.jsonl"
  });

  assert.equal(normalized.transcriptPath, "/home/user/.claude/projects/abc.jsonl");
});

test("TaskStore stores transcriptPath from task-start", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "tp1",
    transcriptPath: "/tmp/transcript.jsonl",
    title: "Session started",
    at: "2026-02-16T10:00:00.000Z"
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].transcriptPath, "/tmp/transcript.jsonl");
});

test("TaskStore stores transcriptPath from task-update when not set on start", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "tp2",
    title: "Session started",
    at: "2026-02-16T10:00:00.000Z"
  });
  store.ingest({
    type: "task-update",
    sessionId: "tp2",
    transcriptPath: "/tmp/transcript2.jsonl",
    at: "2026-02-16T10:00:01.000Z"
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].transcriptPath, "/tmp/transcript2.jsonl");
});

test("TaskStore preserves transcriptPath across updates", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "tp3",
    transcriptPath: "/tmp/original.jsonl",
    title: "Session started",
    at: "2026-02-16T10:00:00.000Z"
  });
  store.ingest({
    type: "task-update",
    sessionId: "tp3",
    status: "running",
    at: "2026-02-16T10:00:05.000Z"
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].transcriptPath, "/tmp/original.jsonl");
});

test("TaskStore.setPrompt sets prompt and topic on existing task", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "pr1",
    title: "Session started",
    at: "2026-02-16T10:00:00.000Z"
  });

  const updated = store.setPrompt("pr1", "Fix the login bug", "Fix the login bug");
  assert.equal(updated, true);

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].prompt, "Fix the login bug");
  assert.equal(snapshot.tasks[0].topic, "Fix the login bug");
});

test("TaskStore.setPrompt returns false for unknown session", () => {
  const store = new TaskStore();
  const updated = store.setPrompt("nonexistent", "prompt", "topic");
  assert.equal(updated, false);
});

test("TaskStore.setPrompt does not overwrite existing prompt", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "pr2",
    title: "Session started",
    at: "2026-02-16T10:00:00.000Z"
  });
  store.setPrompt("pr2", "First prompt", "First topic");
  store.setPrompt("pr2", "Second prompt", "Second topic");

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].prompt, "First prompt");
  assert.equal(snapshot.tasks[0].topic, "First topic");
});

test("deriveActivity: stale running task stays working (thinking phase)", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "thinking",
    pid: 790,
    title: "Implement feature",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-update",
    sessionId: "thinking",
    status: "running",
    notes: "Using Edit tool",
    at: "2026-02-16T10:00:05.000Z"
  });

  // 40 seconds later — no hooks fired during thinking
  const linked = store.taskForProcess(
    { pid: 790, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:45.000Z" }
  );

  assert.equal(linked.activity, "working", "running task should stay working during thinking (no hooks for 40s)");
});

test("deriveActivity: stale waiting task shows waiting", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "stale-wait",
    pid: 800,
    title: "Session started",
    status: "waiting",
    at: "2026-02-16T10:00:00.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 800, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:30.000Z" }
  );

  assert.equal(linked.activity, "waiting", "stale task should show waiting");
});

test("deriveActivity: waiting_for_input status shows waiting_for_input", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "input-wait",
    pid: 850,
    title: "Session started",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-update",
    sessionId: "input-wait",
    status: "waiting_for_input",
    notes: "Permission prompt",
    at: "2026-02-16T10:00:05.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 850, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:06.000Z" }
  );

  assert.equal(linked.activity, "waiting_for_input", "waiting_for_input status should map directly");
});

test("deriveActivity: completed task shows finished", () => {
  const store = new TaskStore({ idleThresholdMs: 10_000 });
  store.ingest({
    type: "task-start",
    sessionId: "done-session",
    pid: 860,
    title: "Session started",
    status: "running",
    at: "2026-02-16T10:00:00.000Z"
  });

  store.ingest({
    type: "task-end",
    sessionId: "done-session",
    status: "completed",
    at: "2026-02-16T10:00:10.000Z"
  });

  const linked = store.taskForProcess(
    { pid: 860, command: "claude", state: "sleeping" },
    { now: "2026-02-16T10:00:11.000Z" }
  );

  assert.equal(linked.activity, "finished", "completed session should show finished");
});

// ── Subagent tracking ──────────────────────────────────────────

test("trackSubagent stores subagent with empty toolHistory", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-1",
    sessionId: "parent-1",
    agentType: "Explore",
    description: "Searching codebase"
  });

  const { subagents } = store.snapshot();
  assert.equal(subagents.length, 1);
  assert.equal(subagents[0].agentId, "agent-1");
  assert.equal(subagents[0].agentType, "Explore");
  assert.equal(subagents[0].description, "Searching codebase");
  assert.deepEqual(subagents[0].toolHistory, []);
  assert.equal(subagents[0].currentTool, null);
});

test("updateSubagentTool appends to toolHistory and sets currentTool", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-2",
    sessionId: "parent-2",
    agentType: "Bash"
  });
  store.ingest({
    type: "subagent-session-link",
    agentId: "agent-2",
    subagentSessionId: "sub-session-2"
  });

  // Simulate tool events coming from the subagent's own session
  store.ingest({
    type: "task-update",
    sessionId: "sub-session-2",
    currentTool: "Grep"
  });
  store.ingest({
    type: "task-update",
    sessionId: "sub-session-2",
    currentTool: "Read"
  });

  const { subagents } = store.snapshot();
  assert.equal(subagents[0].currentTool, "Read");
  assert.equal(subagents[0].toolHistory.length, 2);
  assert.equal(subagents[0].toolHistory[0].tool, "Grep");
  assert.equal(subagents[0].toolHistory[1].tool, "Read");
});

test("toolHistory is capped at 20 entries", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-cap",
    sessionId: "parent-cap",
    agentType: "general-purpose"
  });
  store.ingest({
    type: "subagent-session-link",
    agentId: "agent-cap",
    subagentSessionId: "sub-cap"
  });

  for (let i = 0; i < 25; i++) {
    store.ingest({
      type: "task-update",
      sessionId: "sub-cap",
      currentTool: `Tool-${i}`
    });
  }

  const { subagents } = store.snapshot();
  assert.equal(subagents[0].toolHistory.length, 20);
  // Should have the last 20, so first entry is Tool-5
  assert.equal(subagents[0].toolHistory[0].tool, "Tool-5");
  assert.equal(subagents[0].toolHistory[19].tool, "Tool-24");
});

test("toolHistory entries include timestamp", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-ts",
    sessionId: "parent-ts",
    agentType: "Explore"
  });
  store.ingest({
    type: "subagent-session-link",
    agentId: "agent-ts",
    subagentSessionId: "sub-ts"
  });

  const before = new Date().toISOString();
  store.ingest({
    type: "task-update",
    sessionId: "sub-ts",
    currentTool: "Glob"
  });

  const { subagents } = store.snapshot();
  const entry = subagents[0].toolHistory[0];
  assert.equal(entry.tool, "Glob");
  assert.ok(entry.at, "toolHistory entry should have an 'at' timestamp");
  assert.ok(entry.at >= before, "timestamp should be recent");
});

test("removeSubagent clears subagent and its toolHistory", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-rm",
    sessionId: "parent-rm",
    agentType: "Bash"
  });
  store.ingest({
    type: "subagent-session-link",
    agentId: "agent-rm",
    subagentSessionId: "sub-rm"
  });
  store.ingest({
    type: "task-update",
    sessionId: "sub-rm",
    currentTool: "Edit"
  });

  assert.equal(store.snapshot().subagents.length, 1);

  store.ingest({ type: "subagent-stop", agentId: "agent-rm" });

  assert.equal(store.snapshot().subagents.length, 0);
});

test("duplicate tool calls still append to history", () => {
  const store = new TaskStore();
  store.ingest({
    type: "subagent-start",
    agentId: "agent-dup",
    sessionId: "parent-dup",
    agentType: "Explore"
  });
  store.ingest({
    type: "subagent-session-link",
    agentId: "agent-dup",
    subagentSessionId: "sub-dup"
  });

  store.ingest({ type: "task-update", sessionId: "sub-dup", currentTool: "Read" });
  store.ingest({ type: "task-update", sessionId: "sub-dup", currentTool: "Read" });
  store.ingest({ type: "task-update", sessionId: "sub-dup", currentTool: "Grep" });

  const { subagents } = store.snapshot();
  assert.equal(subagents[0].toolHistory.length, 3);
  assert.equal(subagents[0].currentTool, "Grep");
});

test("TaskStore defaults to waiting status on task-start", () => {
  const store = new TaskStore();
  store.ingest({
    type: "task-start",
    sessionId: "default-status",
    title: "New session",
    at: "2026-02-16T10:00:00.000Z"
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.tasks[0].status, "waiting");
});
