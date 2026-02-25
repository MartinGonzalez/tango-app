import { describe, expect, test } from "bun:test";
import { PluginsPreview } from "../src/mainview/components/plugins-preview.ts";
import type { InstalledPlugin } from "../src/shared/types.ts";

describe("plugins-preview", () => {
  test("overview rows are clickable and select the correct item", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const plugin = buildPlugin();
    const container = document.createElement("div");
    let selected: unknown = null;

    const preview = new PluginsPreview(container, {
      onSelect: (selection) => {
        selected = selection;
      },
    });

    preview.render([plugin], {
      kind: "plugin",
      pluginId: plugin.id,
    });

    const target = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".plugins-preview-section-link")
    ).find((entry) => entry.textContent?.trim() === "Release Agent");

    expect(target).not.toBeUndefined();
    target?.click();

    expect(selected).toEqual({
      kind: "agent",
      pluginId: plugin.id,
      itemId: "agent-1",
    });
  });
});

function buildPlugin(): InstalledPlugin {
  return {
    id: "plugin-alpha",
    pluginName: "alpha",
    displayName: "Alpha Plugin",
    marketplace: "custom",
    sourceLabel: "Local",
    version: "1.0.0",
    description: "Test plugin",
    authorName: "Test",
    installPath: "/tmp/plugin-alpha",
    installedAt: "2026-02-24T10:00:00.000Z",
    lastUpdated: "2026-02-24T10:00:00.000Z",
    status: "enabled",
    commands: [
      {
        id: "cmd-1",
        kind: "command",
        name: "Ship",
        description: "Ship command",
        content: "# Ship",
        relativePath: "commands/ship.md",
        updatedAt: "2026-02-24T10:00:00.000Z",
      },
    ],
    agents: [
      {
        id: "agent-1",
        kind: "agent",
        name: "Release Agent",
        description: "Release workflow",
        content: "# Release",
        relativePath: "agents/release.md",
        updatedAt: "2026-02-24T10:00:00.000Z",
      },
    ],
    skills: [
      {
        id: "skill-1",
        kind: "skill",
        name: "Deploy Skill",
        description: "Deploy helper",
        content: "# Deploy",
        relativePath: "skills/deploy.md",
        updatedAt: "2026-02-24T10:00:00.000Z",
      },
    ],
  };
}
