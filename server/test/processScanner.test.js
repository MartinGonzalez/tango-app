import test from "node:test";
import assert from "node:assert/strict";

import { parsePsOutput, isClaudeProcess } from "../src/processScanner.js";

test("parsePsOutput parses structured ps rows", () => {
  const input = [
    "  PID  PPID  %CPU %MEM STAT ELAPSED COMMAND",
    "123 1 12.0 0.1 S 00:10:12 /usr/local/bin/claude code",
    "456 123 0.0 0.0 S 00:00:30 node worker.js"
  ].join("\n");

  const rows = parsePsOutput(input);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    pid: 123,
    ppid: 1,
    cpu: 12,
    mem: 0.1,
    stat: "S",
    elapsed: "00:10:12",
    command: "/usr/local/bin/claude code"
  });
});

test("isClaudeProcess identifies Claude CLI and app process names", () => {
  assert.equal(isClaudeProcess("/opt/homebrew/bin/claude"), true);
  assert.equal(isClaudeProcess("/Applications/Claude.app/Contents/MacOS/Claude"), true);
  assert.equal(isClaudeProcess("node build.js"), false);
});
