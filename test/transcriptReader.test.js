import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readPromptFromTranscript } from "../src/transcriptReader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "__fixtures__");

test.before(async () => {
  await mkdir(fixtureDir, { recursive: true });
});

test.after(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

test("extracts prompt from transcript with user message", async () => {
  const filePath = path.join(fixtureDir, "basic.jsonl");
  const lines = [
    JSON.stringify({ type: "file-history-snapshot", messageId: "m0", snapshot: {} }),
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "Add a login button to the dashboard" },
      uuid: "u1",
      timestamp: "2026-02-16T10:00:00.000Z"
    }),
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Sure, let me do that." }] },
      uuid: "u2",
      timestamp: "2026-02-16T10:00:01.000Z"
    })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result.prompt, "Add a login button to the dashboard");
  assert.equal(result.topic, "Add a login button to the dashboard");
});

test("truncates topic to 120 characters using first line", async () => {
  const filePath = path.join(fixtureDir, "long-prompt.jsonl");
  const longMessage = "A".repeat(200);
  const lines = [
    JSON.stringify({
      type: "user",
      message: { role: "user", content: longMessage },
      uuid: "u1",
      timestamp: "2026-02-16T10:00:00.000Z"
    })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result.prompt, longMessage);
  assert.ok(result.topic.length <= 123); // 120 + "..."
  assert.ok(result.topic.endsWith("..."));
});

test("uses first line of multiline prompt as topic", async () => {
  const filePath = path.join(fixtureDir, "multiline.jsonl");
  const multiline = "Fix the auth bug\nHere is the error stack trace:\nTypeError at line 42";
  const lines = [
    JSON.stringify({
      type: "user",
      message: { role: "user", content: multiline },
      uuid: "u1",
      timestamp: "2026-02-16T10:00:00.000Z"
    })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result.prompt, multiline);
  assert.equal(result.topic, "Fix the auth bug");
});

test("handles content as array of content blocks", async () => {
  const filePath = path.join(fixtureDir, "array-content.jsonl");
  const lines = [
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "text", text: "Refactor the database module" },
          { type: "text", text: "Use connection pooling" }
        ]
      },
      uuid: "u1",
      timestamp: "2026-02-16T10:00:00.000Z"
    })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result.prompt, "Refactor the database module Use connection pooling");
  assert.equal(result.topic, "Refactor the database module Use connection pooling");
});

test("returns null for missing file", async () => {
  const result = await readPromptFromTranscript("/nonexistent/path/transcript.jsonl");

  assert.equal(result, null);
});

test("returns null for empty file", async () => {
  const filePath = path.join(fixtureDir, "empty.jsonl");
  await writeFile(filePath, "");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result, null);
});

test("returns null when no user message exists in transcript", async () => {
  const filePath = path.join(fixtureDir, "no-user.jsonl");
  const lines = [
    JSON.stringify({ type: "file-history-snapshot", messageId: "m0" }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: "Hello" }, uuid: "u1" })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result, null);
});

test("skips malformed JSON lines gracefully", async () => {
  const filePath = path.join(fixtureDir, "malformed.jsonl");
  const lines = [
    "not valid json at all",
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "Real prompt after garbage" },
      uuid: "u1"
    })
  ];
  await writeFile(filePath, lines.join("\n") + "\n");

  const result = await readPromptFromTranscript(filePath);

  assert.equal(result.prompt, "Real prompt after garbage");
});
