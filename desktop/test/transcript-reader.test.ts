import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readTranscript } from "../src/bun/transcript-reader.ts";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "transcript-test-"));
});

afterEach(async () => {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(tempDir, { recursive: true });
  } catch {}
});

describe("readTranscript", () => {
  test("returns empty array for missing file", async () => {
    const result = await readTranscript("/nonexistent/path.jsonl");
    expect(result).toEqual([]);
  });

  test("returns empty array for empty file", async () => {
    const path = join(tempDir, "empty.jsonl");
    await writeFile(path, "");
    const result = await readTranscript(path);
    expect(result).toEqual([]);
  });

  test("parses user message with string content", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "user",
        message: { content: "Fix the auth bug" },
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("Fix the auth bug");
  });

  test("parses user message with array content", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "text", text: "First part" },
            { type: "text", text: "Second part" },
          ],
        },
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("First part\nSecond part");
  });

  test("parses assistant message", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "assistant",
        message: { content: "I'll fix the bug now." },
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
  });

  test("extracts tool_use info from assistant messages", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Let me read the file." },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/src/app.ts" },
            },
          ],
        },
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe("Read");
    expect(result[0].toolInput).toEqual({ file_path: "/src/app.ts" });
  });

  test("parses multiple messages in order", async () => {
    const path = join(tempDir, "test.jsonl");
    const lines = [
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: "Hi there" },
      }),
      JSON.stringify({
        type: "user",
        message: { content: "Fix the bug" },
      }),
    ].join("\n");
    await writeFile(path, lines + "\n");

    const result = await readTranscript(path);
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
    expect(result[2].role).toBe("user");
  });

  test("skips malformed JSON lines", async () => {
    const path = join(tempDir, "test.jsonl");
    const lines = [
      "not valid json",
      JSON.stringify({ type: "user", message: { content: "Valid" } }),
      "{ broken",
    ].join("\n");
    await writeFile(path, lines + "\n");

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Valid");
  });

  test("skips entries with unknown type", async () => {
    const path = join(tempDir, "test.jsonl");
    const lines = [
      JSON.stringify({ type: "unknown", message: { content: "skip me" } }),
      JSON.stringify({ type: "user", message: { content: "keep me" } }),
    ].join("\n");
    await writeFile(path, lines + "\n");

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("keep me");
  });

  test("preserves timestamp if present", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "user",
        message: { content: "Hello" },
        timestamp: "2024-01-01T00:00:00Z",
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result[0].timestamp).toBe("2024-01-01T00:00:00Z");
  });

  test("skips user entries marked as isMeta", async () => {
    const path = join(tempDir, "test.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: { content: [{ type: "text", text: "meta prompt expansion" }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: "real message" },
      }),
    ].join("\n");
    await writeFile(path, `${lines}\n`);

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBe("real message");
  });

  test("normalizes wrapped slash command user messages", async () => {
    const path = join(tempDir, "test.jsonl");
    await writeFile(
      path,
      JSON.stringify({
        type: "user",
        message: {
          content: "<command-message>ping</command-message>\n<command-name>/ping</command-name>",
        },
      }) + "\n"
    );

    const result = await readTranscript(path);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("/ping");
  });
});
