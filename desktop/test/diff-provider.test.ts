import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiffFile } from "../src/shared/types.ts";
import {
  beginTurnDiff,
  clearLastTurnDiffForSession,
  clearLastTurnDiffForWorkspace,
  finalizeTurnDiff,
  getDiff,
} from "../src/bun/diff-provider.ts";

describe("diff-provider getDiff", () => {
  let repoDir = "";

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "claude-watcher-diff-"));
    await git(repoDir, ["init"]);
    await git(repoDir, ["config", "user.email", "test@example.com"]);
    await git(repoDir, ["config", "user.name", "Test User"]);

    await writeFile(join(repoDir, "tracked.txt"), "line one\n", "utf-8");
    await git(repoDir, ["add", "tracked.txt"]);
    await git(repoDir, ["commit", "-m", "initial commit"]);
  });

  afterEach(async () => {
    if (!repoDir) return;
    await clearLastTurnDiffForWorkspace(repoDir).catch(() => {});
    await rm(repoDir, { recursive: true, force: true });
  });

  test("includes untracked files in all-scope git diff", async () => {
    await writeFile(join(repoDir, "new-file.txt"), "alpha\nbeta", "utf-8");

    const diff = await getDiff(repoDir, "all");
    const added = byPath(diff, "new-file.txt");

    expect(added).toBeDefined();
    expect(added?.status).toBe("added");
    expect(added?.isBinary).toBe(false);
    expect(added?.hunks).toHaveLength(1);
    expect(added?.hunks[0].lines.map((line) => line.type)).toEqual(["add", "add"]);
  });

  test("returns both tracked edits and untracked files", async () => {
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\n", "utf-8");
    await writeFile(join(repoDir, "outside.txt"), "new content", "utf-8");

    const diff = await getDiff(repoDir, "all");

    expect(diff.map((file) => file.path)).toEqual(["outside.txt", "tracked.txt"]);
    expect(byPath(diff, "outside.txt")?.status).toBe("added");
    expect(byPath(diff, "tracked.txt")?.status).toBe("modified");
  });

  test("persists last-turn diff across module reloads", async () => {
    await beginTurnDiff(repoDir, "session-persist");
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\n", "utf-8");
    await finalizeTurnDiff(repoDir, "session-persist");

    const inMemory = await getDiff(repoDir, "last_turn", "session-persist");
    expect(byPath(inMemory, "tracked.txt")?.status).toBe("modified");

    const reloaded = await import(`../src/bun/diff-provider.ts?reload=${Date.now()}`);
    const restored = await reloaded.getDiff(repoDir, "last_turn", "session-persist");
    expect(byPath(restored, "tracked.txt")?.status).toBe("modified");
  });

  test("clears persisted last-turn diff when the source session is deleted", async () => {
    await beginTurnDiff(repoDir, "session-delete");
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\n", "utf-8");
    await finalizeTurnDiff(repoDir, "session-delete");

    await clearLastTurnDiffForSession("session-delete", repoDir);

    const afterDelete = await getDiff(repoDir, "last_turn", "session-delete");
    expect(afterDelete).toEqual([]);

    const reloaded = await import(`../src/bun/diff-provider.ts?reload=${Date.now()}`);
    const restored = await reloaded.getDiff(repoDir, "last_turn", "session-delete");
    expect(restored).toEqual([]);
  });

  test("returns empty last-turn diff when no session is selected", async () => {
    await beginTurnDiff(repoDir, "session-a");
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\n", "utf-8");
    await finalizeTurnDiff(repoDir, "session-a");

    const noSession = await getDiff(repoDir, "last_turn");
    expect(noSession).toEqual([]);
  });

  test("keeps last-turn diffs isolated per session", async () => {
    await beginTurnDiff(repoDir, "session-a");
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\n", "utf-8");
    await finalizeTurnDiff(repoDir, "session-a");

    await beginTurnDiff(repoDir, "session-b");
    await writeFile(join(repoDir, "tracked.txt"), "line one\nline two\nline three\n", "utf-8");
    await finalizeTurnDiff(repoDir, "session-b");

    const sessionA = await getDiff(repoDir, "last_turn", "session-a");
    const sessionB = await getDiff(repoDir, "last_turn", "session-b");
    const missing = await getDiff(repoDir, "last_turn", "session-missing");

    expect(byPath(sessionA, "tracked.txt")?.status).toBe("modified");
    expect(byPath(sessionB, "tracked.txt")?.status).toBe("modified");
    expect(missing).toEqual([]);
  });
});

function byPath(files: DiffFile[], path: string): DiffFile | undefined {
  return files.find((file) => file.path === path);
}

async function git(cwd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode === 0) return;

  const stderr = await new Response(proc.stderr).text();
  throw new Error(`git ${args.join(" ")} failed (${exitCode}): ${stderr}`);
}
