import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getInstalledPlugins } from "../src/bun/plugins.ts";

let tempRoot: string;
let pluginsDir: string;
let userConfigDir: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "plugins-test-"));
  pluginsDir = join(tempRoot, "plugins");
  userConfigDir = join(tempRoot, ".claude");
  await mkdir(pluginsDir, { recursive: true });
  await mkdir(userConfigDir, { recursive: true });
});

afterEach(async () => {
  try {
    await rm(tempRoot, { recursive: true });
  } catch {}
});

describe("installed plugins reader", () => {
  test("loads plugin metadata and nested items", async () => {
    const installPath = join(
      pluginsDir,
      "cache",
      "demo-marketplace",
      "github-toolkit",
      "1.0.2"
    );

    await mkdir(join(installPath, ".claude-plugin"), { recursive: true });
    await mkdir(join(installPath, "commands"), { recursive: true });
    await mkdir(join(installPath, "agents"), { recursive: true });
    await mkdir(join(installPath, "skills", "commit-helper"), {
      recursive: true,
    });

    await writeFile(
      join(installPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "github-toolkit",
        version: "1.0.2",
        description: "GitHub workflows",
        author: { name: "Martin" },
      })
    );

    await writeFile(
      join(installPath, "commands", "pr-create.md"),
      `---\ndescription: "Create a PR"\n---\n\nCommand body`
    );

    await writeFile(
      join(installPath, "agents", "commit-agent.md"),
      `---\nname: commit-helper\ndescription: Helps with commits\n---\n\nAgent body`
    );

    await writeFile(
      join(installPath, "skills", "commit-helper", "SKILL.md"),
      `---\ndescription: Skill description\n---\n\n# Skill`
    );

    await writeFile(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "github-toolkit@demo-marketplace": [
            {
              scope: "user",
              installPath,
              version: "1.0.2",
              installedAt: "2026-02-01T10:00:00.000Z",
              lastUpdated: "2026-02-16T11:57:26.483Z",
            },
          ],
        },
      })
    );

    const plugins = await getInstalledPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);

    const plugin = plugins[0];
    expect(plugin.id).toBe("github-toolkit@demo-marketplace");
    expect(plugin.displayName).toBe("Github Toolkit");
    expect(plugin.version).toBe("1.0.2");
    expect(plugin.description).toBe("GitHub workflows");
    expect(plugin.authorName).toBe("Martin");
    expect(plugin.commands.map((item) => item.name)).toEqual(["/pr-create"]);
    expect(plugin.agents.map((item) => item.name)).toEqual(["commit-helper"]);
    expect(plugin.skills.map((item) => item.name)).toEqual(["commit-helper"]);
  });

  test("marks blocklisted plugins as disabled", async () => {
    const installPath = join(pluginsDir, "cache", "demo", "toolkit", "1.0.0");
    await mkdir(join(installPath, ".claude-plugin"), { recursive: true });
    await writeFile(
      join(installPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "toolkit", description: "test" })
    );

    await writeFile(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "toolkit@demo": [
            {
              installPath,
              version: "1.0.0",
              lastUpdated: "2026-02-20T10:00:00.000Z",
            },
          ],
        },
      })
    );

    await writeFile(
      join(pluginsDir, "blocklist.json"),
      JSON.stringify({
        plugins: [
          {
            plugin: "toolkit@demo",
          },
        ],
      })
    );

    const plugins = await getInstalledPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe("disabled");
  });

  test("uses the newest install entry when multiple exist", async () => {
    const oldInstall = join(pluginsDir, "cache", "demo", "toolkit", "1.0.0");
    const newInstall = join(pluginsDir, "cache", "demo", "toolkit", "1.0.1");

    await mkdir(join(oldInstall, ".claude-plugin"), { recursive: true });
    await mkdir(join(newInstall, ".claude-plugin"), { recursive: true });
    await mkdir(join(oldInstall, "commands"), { recursive: true });
    await mkdir(join(newInstall, "commands"), { recursive: true });

    await writeFile(
      join(oldInstall, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "toolkit", version: "1.0.0" })
    );
    await writeFile(
      join(newInstall, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "toolkit", version: "1.0.1" })
    );

    await writeFile(join(oldInstall, "commands", "old.md"), "old");
    await writeFile(join(newInstall, "commands", "new.md"), "new");

    await writeFile(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "toolkit@demo": [
            {
              installPath: oldInstall,
              version: "1.0.0",
              lastUpdated: "2026-02-01T10:00:00.000Z",
            },
            {
              installPath: newInstall,
              version: "1.0.1",
              lastUpdated: "2026-02-15T10:00:00.000Z",
            },
          ],
        },
      })
    );

    const plugins = await getInstalledPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].version).toBe("1.0.1");
    expect(plugins[0].commands.map((item) => item.name)).toEqual(["/new"]);
  });

  test("adds a User entry with user-level commands, agents, and skills", async () => {
    await mkdir(join(userConfigDir, "commands"), { recursive: true });
    await mkdir(join(userConfigDir, "agents"), { recursive: true });
    await mkdir(join(userConfigDir, "skills", "review-helper"), { recursive: true });

    await writeFile(
      join(userConfigDir, "commands", "ship.md"),
      `---\ndescription: "Ship build"\n---\n\nCommand body`
    );
    await writeFile(
      join(userConfigDir, "agents", "commit-helper.md"),
      `---\nname: commit-helper\ndescription: Agent description\n---\n\nAgent body`
    );
    await writeFile(
      join(userConfigDir, "skills", "review-helper", "SKILL.md"),
      `---\ndescription: Skill description\n---\n\n# Skill`
    );

    const plugins = await getInstalledPlugins(pluginsDir, { userConfigDir });
    const userPlugin = plugins.find((plugin) => plugin.id === "user@local");

    expect(userPlugin).toBeTruthy();
    expect(userPlugin?.displayName).toBe("User");
    expect(userPlugin?.sourceLabel).toBe("User");
    expect(userPlugin?.commands.map((item) => item.name)).toEqual(["/ship"]);
    expect(userPlugin?.agents.map((item) => item.name)).toEqual(["commit-helper"]);
    expect(userPlugin?.skills.map((item) => item.name)).toEqual(["review-helper"]);
    expect(userPlugin?.commands[0]?.relativePath).toBe("commands/ship.md");
    expect(userPlugin?.agents[0]?.relativePath).toBe("agents/commit-helper.md");
    expect(userPlugin?.skills[0]?.relativePath).toBe("skills/review-helper/SKILL.md");
  });
});
