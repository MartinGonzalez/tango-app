import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRAgentReviewStore } from "../src/bun/pr-agent-review-store.ts";
import {
  AGENT_REVIEW_PLACEHOLDER_MARKER,
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
    expect(run1.fileName).toBe("acme-repo-pr18-agent-review.md");

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
    expect(run2.fileName).toBe("acme-repo-pr18-agent-review-2.md");
  });

  test("reconciles interrupted runs to stale/completed", async () => {
    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();

    const run = await store.startRun({
      repo: "acme/repo",
      number: 7,
      headSha: "head-1",
    });

    await writeFile(run.filePath, `${AGENT_REVIEW_PLACEHOLDER_MARKER}\nStill running`);
    const staleRuns = await store.reconcileInterruptedRuns();
    expect(staleRuns).toHaveLength(1);
    expect(staleRuns[0].status).toBe("stale");

    const run2 = await store.startRun({
      repo: "acme/repo",
      number: 7,
      headSha: "head-2",
    });

    await writeFile(run2.filePath, "# Final review\nDone");
    const completedRuns = await store.reconcileInterruptedRuns();
    const completed = completedRuns.find((entry) => entry.id === run2.id) ?? null;
    expect(completed?.status).toBe("completed");
  });

  test("imports existing review files", async () => {
    const store = new PRAgentReviewStore(storePath, baseDir);
    await store.load();

    const fileV1 = join(baseDir, buildAgentReviewFileName("acme/repo", 5, 1));
    const fileV2 = join(baseDir, buildAgentReviewFileName("acme/repo", 5, 2));

    await writeFile(fileV1, "# Existing review\nok");
    await writeFile(fileV2, `${AGENT_REVIEW_PLACEHOLDER_MARKER}\nin progress`);

    const imported = await store.importExistingFiles("acme/repo", 5);
    expect(imported.map((run) => run.version)).toEqual([1, 2]);
    expect(imported.find((run) => run.version === 1)?.status).toBe("completed");
    expect(imported.find((run) => run.version === 2)?.status).toBe("stale");
  });
});
