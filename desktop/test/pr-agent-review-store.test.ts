import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRAgentReviewStore } from "../src/bun/pr-agent-review-store.ts";
import {
  AGENT_REVIEW_PLACEHOLDER_KEY,
  buildAgentReviewFileName,
} from "../src/bun/pr-agent-review-files.ts";

describe("pr-agent-review-store", () => {
  let tempDir = "";
  let storePath = "";
  let baseDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claude-watcher-agent-review-"));
    storePath = join(tempDir, "pr-agent-reviews.json");
    baseDir = join(tempDir, "reviews");
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    if (!tempDir) return;
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates versioned runs and blocks concurrent running run", async () => {
    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();

    const run1 = await store.startRun({
      repo: "acme/repo",
      number: 18,
      headSha: "head-1",
    });
    expect(run1.version).toBe(1);
    expect(run1.fileName).toBe("acme-repo-pr18-agent-review.json");

    await expect(store.startRun({
      repo: "acme/repo",
      number: 18,
      headSha: "head-1",
    })).rejects.toThrow("already active");

    await store.markCompleted(run1.id);

    const run2 = await store.startRun({
      repo: "acme/repo",
      number: 18,
      headSha: "head-2",
    });
    expect(run2.version).toBe(2);
    expect(run2.fileName).toBe("acme-repo-pr18-agent-review-2.json");
  });

  test("reconciles interrupted runs to stale/completed using JSON placeholder", async () => {
    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();

    const run = await store.startRun({
      repo: "acme/repo",
      number: 7,
      headSha: "head-1",
    });

    await writeFile(run.filePath, JSON.stringify({
      [AGENT_REVIEW_PLACEHOLDER_KEY]: true,
      metadata: {},
      pr_summary: "",
      strengths: "",
      improvements: "",
      suggestions: [],
      final_veredic: "running",
    }, null, 2));
    const staleRuns = await store.reconcileInterruptedRuns();
    expect(staleRuns).toHaveLength(1);
    expect(staleRuns[0].status).toBe("stale");

    const run2 = await store.startRun({
      repo: "acme/repo",
      number: 7,
      headSha: "head-2",
    });

    await writeFile(run2.filePath, JSON.stringify({
      metadata: {
        repository: "acme/repo",
      },
      pr_summary: "ok",
      strengths: "ok",
      improvements: "ok",
      suggestions: [],
      final_veredic: "ok",
    }, null, 2));
    const completedRuns = await store.reconcileInterruptedRuns();
    const completed = completedRuns.find((entry) => entry.id === run2.id) ?? null;
    expect(completed?.status).toBe("completed");
  });

  test("imports existing review JSON files", async () => {
    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();

    const fileV1 = join(baseDir, buildAgentReviewFileName("acme/repo", 5, 1));
    const fileV2 = join(baseDir, buildAgentReviewFileName("acme/repo", 5, 2));

    await writeFile(fileV1, JSON.stringify({
      metadata: {},
      pr_summary: "done",
      strengths: "done",
      improvements: "done",
      suggestions: [],
      final_veredic: "done",
    }, null, 2));
    await writeFile(fileV2, JSON.stringify({
      [AGENT_REVIEW_PLACEHOLDER_KEY]: true,
      metadata: {},
      pr_summary: "",
      strengths: "",
      improvements: "",
      suggestions: [],
      final_veredic: "running",
    }, null, 2));

    const imported = await store.importExistingFiles("acme/repo", 5);
    expect(imported.map((run) => run.version)).toEqual([1, 2]);
    expect(imported.find((run) => run.version === 1)?.status).toBe("completed");
    expect(imported.find((run) => run.version === 2)?.status).toBe("stale");
  });

  test("cleans up legacy markdown files and entries on load", async () => {
    const legacyFile = join(baseDir, "acme-repo-pr5-agent-review.md");
    await writeFile(legacyFile, "# legacy");
    await writeFile(storePath, JSON.stringify({
      "acme/repo#5": [
        {
          id: "legacy",
          repo: "acme/repo",
          number: 5,
          version: 1,
          fileName: "acme-repo-pr5-agent-review.md",
          filePath: legacyFile,
          headSha: "",
          status: "completed",
          sessionId: null,
          startedAt: "2026-02-24T00:00:00.000Z",
          updatedAt: "2026-02-24T00:00:00.000Z",
          completedAt: "2026-02-24T00:00:00.000Z",
          error: null,
        },
      ],
    }, null, 2));

    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();
    const runs = await store.listRuns("acme/repo", 5);
    expect(runs).toHaveLength(0);

    await expect(stat(legacyFile)).rejects.toBeDefined();
    const persisted = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(persisted)).toHaveLength(0);
  });
});
