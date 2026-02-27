import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getSlashCommands,
  invalidateSlashCommandsCache,
} from "../src/bun/slash-commands.ts";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "slash-commands-test-"));
  invalidateSlashCommandsCache();
});

afterEach(async () => {
  invalidateSlashCommandsCache();
  try {
    await rm(tempRoot, { recursive: true });
  } catch {}
});

describe("slash command discovery", () => {
  test("merges project and user commands with project precedence", async () => {
    const cwd = join(tempRoot, "stage");
    await mkdir(join(cwd, ".claude", "commands", "release"), { recursive: true });

    await writeFile(join(cwd, ".claude", "commands", "commit.md"), "project");
    await writeFile(join(cwd, ".claude", "commands", "release", "build.md"), "project");
    await writeFile(join(cwd, ".claude", "commands", "README.txt"), "not a command");

    const commands = await getSlashCommands(cwd);
    const byName = new Map(commands.map((command) => [command.name, command]));

    expect(byName.get("commit")).toEqual({ name: "commit", source: "project" });
    expect(byName.get("release/build")).toEqual({
      name: "release/build",
      source: "project",
    });
    expect(byName.has("README")).toBe(false);
  });

  test("cache can be invalidated for a stage", async () => {
    const cwd = join(tempRoot, "stage");
    const projectCommandsDir = join(cwd, ".claude", "commands");
    await mkdir(projectCommandsDir, { recursive: true });
    await writeFile(join(projectCommandsDir, "commit.md"), "project");

    const first = await getSlashCommands(cwd);
    expect(first.filter((command) => command.source === "project")).toEqual([
      { name: "commit", source: "project" },
    ]);

    await writeFile(join(projectCommandsDir, "pr.md"), "project");
    const cached = await getSlashCommands(cwd);
    expect(cached.filter((command) => command.source === "project")).toEqual([
      { name: "commit", source: "project" },
    ]);

    invalidateSlashCommandsCache(cwd);
    const refreshed = await getSlashCommands(cwd);
    expect(refreshed.filter((command) => command.source === "project")).toEqual([
      { name: "commit", source: "project" },
      { name: "pr", source: "project" },
    ]);
  });
});
