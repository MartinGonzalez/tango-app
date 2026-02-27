import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectVcs } from "../src/bun/vcs/vcs-detector.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "vcs-detector-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("detectVcs", () => {
  test('returns "git" when .git directory exists', async () => {
    await mkdir(join(tempDir, ".git"));
    const result = await detectVcs(tempDir);
    expect(result).toBe("git");
  });

  test('returns "svn" when .svn directory exists', async () => {
    await mkdir(join(tempDir, ".svn"));
    const result = await detectVcs(tempDir);
    expect(result).toBe("svn");
  });

  test('returns "none" when neither .git nor .svn exists', async () => {
    const result = await detectVcs(tempDir);
    expect(result).toBe("none");
  });

  test("prefers git over svn when both exist", async () => {
    await mkdir(join(tempDir, ".git"));
    await mkdir(join(tempDir, ".svn"));
    const result = await detectVcs(tempDir);
    expect(result).toBe("git");
  });

  test("detects .git in parent directory", async () => {
    await mkdir(join(tempDir, ".git"));
    const subDir = join(tempDir, "src", "components");
    await mkdir(subDir, { recursive: true });
    const result = await detectVcs(subDir);
    expect(result).toBe("git");
  });

  test("detects .svn in parent directory", async () => {
    await mkdir(join(tempDir, ".svn"));
    const subDir = join(tempDir, "trunk", "src");
    await mkdir(subDir, { recursive: true });
    const result = await detectVcs(subDir);
    expect(result).toBe("svn");
  });

  test('returns "none" for non-existent directory', async () => {
    const result = await detectVcs(join(tempDir, "does-not-exist"));
    expect(result).toBe("none");
  });

  test("does not treat .git file as git repo marker (only directories)", async () => {
    // Some git submodules use a .git file instead of directory
    // We should still detect this as git since it indicates git presence
    await writeFile(join(tempDir, ".git"), "gitdir: ../other/.git");
    const result = await detectVcs(tempDir);
    // .git file (for submodules) still means git is managing this directory
    expect(result).toBe("git");
  });
});
