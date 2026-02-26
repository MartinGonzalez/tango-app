import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getVcsStrategy,
  getVcsInfo,
  invalidateVcsCache,
} from "../src/bun/vcs/vcs-provider.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "vcs-provider-"));
  // Always invalidate to prevent cross-test cache leaks
  invalidateVcsCache(tempDir);
});

afterEach(async () => {
  invalidateVcsCache(tempDir);
  await rm(tempDir, { recursive: true, force: true });
});

describe("getVcsStrategy", () => {
  test("returns git strategy for git repo", async () => {
    await mkdir(join(tempDir, ".git"));
    const strategy = await getVcsStrategy(tempDir);
    expect(strategy.kind).toBe("git");
  });

  test("returns svn strategy for svn repo", async () => {
    await mkdir(join(tempDir, ".svn"));
    const strategy = await getVcsStrategy(tempDir);
    expect(strategy.kind).toBe("svn");
  });

  test("returns none strategy for plain directory", async () => {
    const strategy = await getVcsStrategy(tempDir);
    expect(strategy.kind).toBe("none");
  });

  test("caches strategy for same cwd", async () => {
    await mkdir(join(tempDir, ".git"));
    const s1 = await getVcsStrategy(tempDir);
    const s2 = await getVcsStrategy(tempDir);
    // Same object reference — proves cache hit
    expect(s1).toBe(s2);
  });

  test("invalidateVcsCache forces re-detection", async () => {
    // Start with no VCS
    const s1 = await getVcsStrategy(tempDir);
    expect(s1.kind).toBe("none");

    // Add .git and invalidate
    await mkdir(join(tempDir, ".git"));
    invalidateVcsCache(tempDir);

    const s2 = await getVcsStrategy(tempDir);
    expect(s2.kind).toBe("git");
  });
});

describe("getVcsInfo", () => {
  test("returns kind and null branch for non-vcs directory", async () => {
    const info = await getVcsInfo(tempDir);
    expect(info.kind).toBe("none");
    expect(info.branch).toBeNull();
  });

  test("returns kind=git for git repo", async () => {
    await mkdir(join(tempDir, ".git"));
    const info = await getVcsInfo(tempDir);
    expect(info.kind).toBe("git");
    // Branch may be null since it's a bare .git dir (not a real repo)
    // We just verify the kind detection works
  });
});
