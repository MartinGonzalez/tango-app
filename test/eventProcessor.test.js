import test from "node:test";
import assert from "node:assert/strict";

import { processHookEvent, generateToolLabel } from "../src/eventProcessor.js";

// ── SessionStart ─────────────────────────────────────────────────

test("SessionStart produces task-start with waiting status", () => {
  const result = processHookEvent({
    hook_event_name: "SessionStart",
    session_id: "s1",
    cwd: "/tmp/project",
    model: "opus",
    source: "cli",
    transcript_path: "/tmp/transcript.jsonl",
    process_id: 1234
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-start");
  assert.equal(ev.sessionId, "s1");
  assert.equal(ev.status, "waiting");
  assert.equal(ev.title, "Session started (cli)");
  assert.equal(ev.cwd, "/tmp/project");
  assert.equal(ev.model, "opus");
  assert.equal(ev.transcriptPath, "/tmp/transcript.jsonl");
  assert.equal(ev.pid, 1234);
  assert.deepEqual(result.notifications, []);
});

test("SessionStart defaults source to startup when missing", () => {
  const result = processHookEvent({
    hook_event_name: "SessionStart",
    session_id: "s2",
    cwd: "/tmp",
    process_id: 100
  });

  assert.equal(result.events[0].title, "Session started (startup)");
});

// ── UserPromptSubmit ─────────────────────────────────────────────

test("UserPromptSubmit produces task-update with running status", () => {
  const result = processHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    cwd: "/tmp/project",
    transcript_path: "/tmp/t.jsonl",
    process_id: 1234
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.sessionId, "s1");
  assert.equal(ev.status, "running");
  assert.equal(ev.title, "Processing prompt");
  assert.equal(ev.pid, 1234);
});

// ── PreToolUse ───────────────────────────────────────────────────

test("PreToolUse produces task-update with running status and tool label", () => {
  const result = processHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/project/src/app.js" },
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "running");
  assert.equal(ev.title, "Editing app.js");
  assert.equal(ev.currentTool, "Edit");
});

test("PreToolUse with Task tool also emits subagent-start", () => {
  const result = processHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Task",
    tool_input: { subagent_type: "Explore", description: "Find tests" },
    tool_use_id: "tu-123",
    process_id: 500
  });

  assert.equal(result.events.length, 2);

  const subagentEvent = result.events.find((e) => e.type === "subagent-start");
  assert.ok(subagentEvent);
  assert.equal(subagentEvent.agentId, "tu-123");
  assert.equal(subagentEvent.sessionId, "s1");
  assert.equal(subagentEvent.agentType, "Explore");
  assert.equal(subagentEvent.description, "Find tests");

  const updateEvent = result.events.find((e) => e.type === "task-update");
  assert.ok(updateEvent);
  assert.equal(updateEvent.currentTool, "Task");
});

// ── PostToolUse ──────────────────────────────────────────────────

test("PostToolUse produces task-update with completed label", () => {
  const result = processHookEvent({
    hook_event_name: "PostToolUse",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Read",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "running");
  assert.equal(ev.title, "Completed: Read");
});

test("PostToolUse with Task tool also emits subagent-stop", () => {
  const result = processHookEvent({
    hook_event_name: "PostToolUse",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Task",
    tool_input: { subagent_type: "Bash" },
    tool_use_id: "tu-456",
    process_id: 500
  });

  assert.equal(result.events.length, 2);

  const subagentEvent = result.events.find((e) => e.type === "subagent-stop");
  assert.ok(subagentEvent);
  assert.equal(subagentEvent.agentId, "tu-456");
});

// ── PostToolUseFailure ───────────────────────────────────────────

test("PostToolUseFailure produces task-update with error status", () => {
  const result = processHookEvent({
    hook_event_name: "PostToolUseFailure",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Bash",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "error");
  assert.equal(ev.title, "Error: Bash failed");
});

// ── Notification ─────────────────────────────────────────────────

test("Notification with permission_prompt sets waiting_for_input", () => {
  const result = processHookEvent({
    hook_event_name: "Notification",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500,
    notification_type: "permission_prompt"
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "waiting_for_input");
  assert.equal(ev.title, "Waiting for input");
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].message, "Claude requires your input");
});

test("Notification with elicitation_dialog sets waiting_for_input", () => {
  const result = processHookEvent({
    hook_event_name: "Notification",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500,
    notification_type: "elicitation_dialog"
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].status, "waiting_for_input");
  assert.equal(result.notifications.length, 1);
});

test("Notification with idle_prompt does not change state", () => {
  const result = processHookEvent({
    hook_event_name: "Notification",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500,
    notification_type: "idle_prompt"
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.notifications.length, 0);
});

test("Notification without notification_type does not change state", () => {
  const result = processHookEvent({
    hook_event_name: "Notification",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.notifications.length, 0);
});

// ── PermissionRequest ────────────────────────────────────────────

test("PermissionRequest produces task-update with waiting_for_input", () => {
  const result = processHookEvent({
    hook_event_name: "PermissionRequest",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "waiting_for_input");
  assert.equal(ev.title, "Waiting for permission");
});

test("PermissionRequest emits a macOS notification", () => {
  const result = processHookEvent({
    hook_event_name: "PermissionRequest",
    session_id: "s1",
    cwd: "/tmp/repo",
    process_id: 500
  });

  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].message, "Permission required");
});

// ── SubagentStart ────────────────────────────────────────────────

test("SubagentStart produces subagent-session-link event", () => {
  const result = processHookEvent({
    hook_event_name: "SubagentStart",
    session_id: "sub-session-1",
    agent_id: "agent-1",
    agent_type: "Explore",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "subagent-session-link");
  assert.equal(ev.subagentSessionId, "sub-session-1");
  assert.equal(ev.agentId, "agent-1");
});

// ── SubagentStop ─────────────────────────────────────────────────

test("SubagentStop produces subagent-stop event", () => {
  const result = processHookEvent({
    hook_event_name: "SubagentStop",
    session_id: "sub-session-1",
    agent_id: "agent-1",
    agent_type: "Explore",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "subagent-stop");
  assert.equal(ev.agentId, "agent-1");
});

// ── TaskCompleted ────────────────────────────────────────────────

test("TaskCompleted produces task-update with completed status", () => {
  const result = processHookEvent({
    hook_event_name: "TaskCompleted",
    session_id: "s1",
    cwd: "/tmp/project",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "completed");
  assert.equal(ev.title, "Task completed");
});

test("TaskCompleted emits a macOS notification", () => {
  const result = processHookEvent({
    hook_event_name: "TaskCompleted",
    session_id: "s1",
    cwd: "/tmp/my-app",
    process_id: 500
  });

  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].message, "Task completed successfully");
});

// ── Stop ─────────────────────────────────────────────────────────

test("Stop produces task-update with waiting status", () => {
  const result = processHookEvent({
    hook_event_name: "Stop",
    session_id: "s1",
    cwd: "/tmp/project",
    transcript_path: "/tmp/t.jsonl",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-update");
  assert.equal(ev.status, "waiting");
  assert.equal(ev.title, "Finished responding");
});

test("Stop emits a macOS notification", () => {
  const result = processHookEvent({
    hook_event_name: "Stop",
    session_id: "s1",
    cwd: "/tmp/my-project",
    process_id: 500
  });

  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].title, "my-project");
  assert.equal(result.notifications[0].message, "Claude finished working");
});

// ── SessionEnd ───────────────────────────────────────────────────

test("SessionEnd produces task-end with completed status", () => {
  const result = processHookEvent({
    hook_event_name: "SessionEnd",
    session_id: "s1",
    process_id: 500
  });

  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.type, "task-end");
  assert.equal(ev.sessionId, "s1");
  assert.equal(ev.status, "completed");
  assert.equal(ev.pid, 500);
});

// ── Unknown event ────────────────────────────────────────────────

test("Unknown hook_event_name returns empty events and no notifications", () => {
  const result = processHookEvent({
    hook_event_name: "SomeFutureEvent",
    session_id: "s1",
    process_id: 500
  });

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.notifications, []);
});

// ── generateToolLabel ────────────────────────────────────────────

test("generateToolLabel: Bash truncates command to 120 chars", () => {
  const longCmd = "a".repeat(200);
  const label = generateToolLabel("Bash", { command: longCmd });
  assert.equal(label, `Running: ${"a".repeat(120)}`);
});

test("generateToolLabel: Edit shows basename", () => {
  const label = generateToolLabel("Edit", { file_path: "/tmp/project/src/app.js" });
  assert.equal(label, "Editing app.js");
});

test("generateToolLabel: Write shows basename", () => {
  const label = generateToolLabel("Write", { file_path: "/tmp/project/src/new-file.ts" });
  assert.equal(label, "Writing new-file.ts");
});

test("generateToolLabel: Read shows basename", () => {
  const label = generateToolLabel("Read", { file_path: "/home/user/README.md" });
  assert.equal(label, "Reading README.md");
});

test("generateToolLabel: Glob shows pattern", () => {
  const label = generateToolLabel("Glob", { pattern: "**/*.test.js" });
  assert.equal(label, "Searching files: **/*.test.js");
});

test("generateToolLabel: Grep shows pattern", () => {
  const label = generateToolLabel("Grep", { pattern: "TODO" });
  assert.equal(label, "Searching code: TODO");
});

test("generateToolLabel: WebFetch shows url", () => {
  const label = generateToolLabel("WebFetch", { url: "https://example.com/api" });
  assert.equal(label, "Fetching https://example.com/api");
});

test("generateToolLabel: Task returns Task", () => {
  const label = generateToolLabel("Task", { subagent_type: "Explore" });
  assert.equal(label, "Task");
});

test("generateToolLabel: unknown tool falls back to Using {name}", () => {
  const label = generateToolLabel("NotebookEdit", {});
  assert.equal(label, "Using NotebookEdit");
});

test("generateToolLabel: handles missing tool_input gracefully", () => {
  const label = generateToolLabel("Edit", undefined);
  assert.equal(label, "Editing ");
});

// ── Optional field passthrough ───────────────────────────────────

test("context_percentage is passed through on SessionStart", () => {
  const result = processHookEvent({
    hook_event_name: "SessionStart",
    session_id: "s1",
    cwd: "/tmp",
    process_id: 100,
    context_percentage: 42
  });

  assert.equal(result.events[0].contextPercentage, 42);
});

test("transcript_path is passed through on PreToolUse", () => {
  const result = processHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s1",
    cwd: "/tmp",
    tool_name: "Read",
    tool_input: { file_path: "/tmp/foo.js" },
    transcript_path: "/tmp/t.jsonl",
    process_id: 100
  });

  assert.equal(result.events[0].transcriptPath, "/tmp/t.jsonl");
});

test("context_percentage is passed through on task-update events", () => {
  const result = processHookEvent({
    hook_event_name: "Stop",
    session_id: "s1",
    cwd: "/tmp",
    process_id: 100,
    context_percentage: 78
  });

  assert.equal(result.events[0].contextPercentage, 78);
});
