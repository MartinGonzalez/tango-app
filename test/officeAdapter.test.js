import test from "node:test";
import assert from "node:assert/strict";

import { OfficeAdapter } from "../public/office.js";

// Helper: build a minimal snapshot process entry
function proc({ pid, activity, sessionId, cwd, appName } = {}) {
  return {
    pid: pid ?? 100,
    appName: appName ?? "claude",
    activity: activity ?? "working",
    task: sessionId ? { sessionId, cwd: cwd ?? "/home/user/project" } : null
  };
}

test("empty snapshot produces no commands", () => {
  const adapter = new OfficeAdapter();
  const cmds = adapter.reconcile({ processes: [] });

  assert.deepEqual(cmds, { spawn: [], move: [], remove: [] });
});

test("new working process triggers spawn + move to work", () => {
  const adapter = new OfficeAdapter();
  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  assert.equal(cmds.spawn.length, 1);
  assert.equal(cmds.spawn[0].id, "s1");
  assert.equal(cmds.spawn[0].zone, "work");
  assert.equal(cmds.move.length, 0, "first reconcile should spawn, not move");
});

test("same process in second poll produces no spawn or move", () => {
  const adapter = new OfficeAdapter();

  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  // Second poll — same state
  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  assert.equal(cmds.spawn.length, 0, "should not re-spawn");
  assert.equal(cmds.move.length, 0, "should not move if zone unchanged");
});

test("activity change from working to idle triggers move to lounge after debounce", () => {
  const adapter = new OfficeAdapter();

  // Poll 1: working
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  // Poll 2: idle (first time — debounce, no move yet)
  const cmds1 = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "idle" })]
  });
  assert.equal(cmds1.move.length, 0, "debounce: should not move on first activity change");

  // Poll 3: idle again — now it should move
  const cmds2 = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "idle" })]
  });
  assert.equal(cmds2.move.length, 1);
  assert.equal(cmds2.move[0].id, "s1");
  assert.equal(cmds2.move[0].zone, "lounge");
});

test("process disappearing from snapshot triggers remove", () => {
  const adapter = new OfficeAdapter();

  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  const cmds = adapter.reconcile({ processes: [] });

  assert.equal(cmds.remove.length, 1);
  assert.equal(cmds.remove[0].id, "s1");
});

test("desk assignment is persistent across reconcile calls", () => {
  const adapter = new OfficeAdapter();

  const cmds1 = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  const desk1 = cmds1.spawn[0].deskIndex;

  // Move to lounge and back to work — desk stays the same
  // Debounce: 2 polls idle
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "idle" })]
  });
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "idle" })]
  });

  // Now back to working — debounce 2 polls
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });
  const cmds2 = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  assert.equal(cmds2.move.length, 1);
  assert.equal(cmds2.move[0].deskIndex, desk1, "desk index should be persistent");
});

test("debounce resets when activity flickers back", () => {
  const adapter = new OfficeAdapter();

  // Poll 1: working (spawn)
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  // Poll 2: idle (debounce count = 1)
  adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "idle" })]
  });

  // Poll 3: back to working (debounce resets, no move)
  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "working" })]
  });

  assert.equal(cmds.move.length, 0, "flicker back should reset debounce");
});

test("naming: uses basename of cwd, falls back to appName, truncates to 15 chars", () => {
  const adapter = new OfficeAdapter();

  // With cwd
  const cmds1 = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", cwd: "/Users/me/Desktop/claude-watcher", activity: "working" })]
  });
  assert.equal(cmds1.spawn[0].name, "claude-watcher");

  // Without task (no cwd) — uses appName
  const adapter2 = new OfficeAdapter();
  const cmds2 = adapter2.reconcile({
    processes: [{
      pid: 2, appName: "Claude.app", activity: "idle",
      task: null
    }]
  });
  assert.equal(cmds2.spawn[0].name, "Claude.app");

  // Long name truncated
  const adapter3 = new OfficeAdapter();
  const cmds3 = adapter3.reconcile({
    processes: [proc({
      pid: 3, sessionId: "s3",
      cwd: "/Users/me/super-long-project-name-wow",
      activity: "working"
    })]
  });
  assert.ok(cmds3.spawn[0].name.length <= 15, "name should be truncated to 15 chars");
});

test("process without task uses pid-{pid} as ID", () => {
  const adapter = new OfficeAdapter();
  const cmds = adapter.reconcile({
    processes: [{
      pid: 42, appName: "claude", activity: "working",
      task: null
    }]
  });

  assert.equal(cmds.spawn[0].id, "pid-42");
});

test("waiting_for_input maps to plan zone", () => {
  const adapter = new OfficeAdapter();

  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "waiting_for_input" })]
  });

  assert.equal(cmds.spawn[0].zone, "plan");
});

test("waiting activity maps to plan zone (not lounge)", () => {
  const adapter = new OfficeAdapter();

  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "waiting" })]
  });

  assert.equal(cmds.spawn[0].zone, "plan", "waiting (between turns) should map to plan, not lounge");
});

test("finished activity maps to lounge zone", () => {
  const adapter = new OfficeAdapter();

  const cmds = adapter.reconcile({
    processes: [proc({ pid: 1, sessionId: "s1", activity: "finished" })]
  });

  assert.equal(cmds.spawn[0].zone, "lounge");
});

test("multiple processes get unique desk indices", () => {
  const adapter = new OfficeAdapter();
  const cmds = adapter.reconcile({
    processes: [
      proc({ pid: 1, sessionId: "s1", activity: "working" }),
      proc({ pid: 2, sessionId: "s2", activity: "working" }),
      proc({ pid: 3, sessionId: "s3", activity: "working" })
    ]
  });

  const desks = cmds.spawn.map(s => s.deskIndex);
  const unique = new Set(desks);
  assert.equal(unique.size, 3, "each agent should get a unique desk");
});
