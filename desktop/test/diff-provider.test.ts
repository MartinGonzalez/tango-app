import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiffFile } from "../src/shared/types.ts";
import { getDiff } from "../src/bun/diff-provider.ts";

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
