import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRReviewStore } from "../src/bun/pr-review-store.ts";

describe("pr-review-store", () => {
  let tempDir = "";
  let filePath = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claude-watcher-pr-review-"));
    filePath = join(tempDir, "pr-review-state.json");
  });

  afterEach(async () => {
    if (!tempDir) return;
    await rm(tempDir, { recursive: true, force: true });
  });

  test("persists seen/unseen state", async () => {
    const store = new PRReviewStore(filePath);
    await store.load();

    expect(store.get("acme/project", 10)).toBeNull();

    const seenState = await store.setFileSeen({
      repo: "acme/project",
      number: 10,
      headSha: "head-1",
      filePath: "src/app.ts",
      fileSha: "sha-1",
      seen: true,
    });

    expect(seenState.reviewedHeadSha).toBe("head-1");
    expect(seenState.viewedFiles["src/app.ts"]?.sha).toBe("sha-1");

    const unseenState = await store.setFileSeen({
      repo: "acme/project",
      number: 10,
      headSha: "head-1",
      filePath: "src/app.ts",
      fileSha: "sha-1",
      seen: false,
    });

    expect(unseenState.viewedFiles["src/app.ts"]).toBeUndefined();

    const reloaded = new PRReviewStore(filePath);
    await reloaded.load();
    const restored = reloaded.get("acme/project", 10);
    expect(restored).not.toBeNull();
    expect(restored?.viewedFiles["src/app.ts"]).toBeUndefined();
  });

  test("marks all files as seen and stores head sha", async () => {
    const store = new PRReviewStore(filePath);
    await store.load();

    const state = await store.markFilesSeen({
      repo: "acme/project",
      number: 55,
      headSha: "head-2",
      files: [
        { path: "a.ts", sha: "sha-a" },
        { path: "b.ts", sha: "sha-b" },
      ],
    });

    expect(state.reviewedHeadSha).toBe("head-2");
    expect(Object.keys(state.viewedFiles)).toEqual(["a.ts", "b.ts"]);
    expect(state.viewedFiles["b.ts"]?.sha).toBe("sha-b");
  });
});
