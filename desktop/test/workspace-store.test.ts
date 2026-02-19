import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { WorkspaceStore } from "../src/bun/workspace-store.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;
let filePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ws-test-"));
  filePath = join(tempDir, "workspaces.json");
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true });
  } catch {}
});

describe("WorkspaceStore", () => {
  test("getAll returns empty array before load", () => {
    const store = new WorkspaceStore(filePath);
    expect(store.getAll()).toEqual([]);
  });

  test("load with missing file results in empty list", async () => {
    const store = new WorkspaceStore(filePath);
    await store.load();
    expect(store.getAll()).toEqual([]);
  });

  test("add places new workspace at front", async () => {
    const store = new WorkspaceStore(filePath);
    await store.load();

    await store.add("/project/a");
    await store.add("/project/b");

    const all = store.getAll();
    expect(all[0]).toBe("/project/b");
    expect(all[1]).toBe("/project/a");
  });

  test("add moves existing workspace to front", async () => {
    const store = new WorkspaceStore(filePath);
    await store.load();

    await store.add("/project/a");
    await store.add("/project/b");
    await store.add("/project/a"); // Re-add

    const all = store.getAll();
    expect(all).toEqual(["/project/a", "/project/b"]);
  });

  test("remove deletes workspace", async () => {
    const store = new WorkspaceStore(filePath);
    await store.load();

    await store.add("/project/a");
    await store.add("/project/b");
    await store.remove("/project/a");

    const all = store.getAll();
    expect(all).toEqual(["/project/b"]);
  });

  test("getAll returns a copy, not a reference", async () => {
    const store = new WorkspaceStore(filePath);
    await store.load();

    await store.add("/project/a");
    const all1 = store.getAll();
    all1.push("/fake");

    expect(store.getAll()).toEqual(["/project/a"]);
  });

  test("persists data across instances", async () => {
    const store1 = new WorkspaceStore(filePath);
    await store1.load();
    await store1.add("/project/a");
    await store1.add("/project/b");

    // New instance reading the same file
    const store2 = new WorkspaceStore(filePath);
    await store2.load();

    expect(store2.getAll()).toEqual(["/project/b", "/project/a"]);
  });
});
