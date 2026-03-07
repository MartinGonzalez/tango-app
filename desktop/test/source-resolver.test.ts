import { describe, expect, test, beforeEach, mock } from "bun:test";

// We test the pure logic by importing the module and mocking fetch
import {
  resolveAllSources,
  loadSourceConfig,
  addSource,
  removeSource,
  saveSourceConfig,
} from "../src/bun/instruments/source-resolver.ts";

// ── Helpers ──

function makeTangoJson(paths: string[]): string {
  return JSON.stringify({
    instruments: paths.map((p) => ({ path: p })),
  });
}

function makePackageJson(overrides: {
  id: string;
  name: string;
  category?: string;
  version?: string;
  description?: string;
  icon?: string;
  permissions?: string[];
}): string {
  return JSON.stringify({
    name: `@tango/${overrides.id}`,
    version: overrides.version ?? "1.0.0",
    description: overrides.description,
    tango: {
      instrument: {
        id: overrides.id,
        name: overrides.name,
        category: overrides.category,
        runtime: "react",
        entrypoint: "./dist/index.js",
        panels: { sidebar: true, first: true, second: false, right: false },
        permissions: overrides.permissions ?? [],
        launcher: overrides.icon
          ? { sidebarShortcut: { enabled: true, icon: overrides.icon } }
          : undefined,
      },
    },
  });
}

// ── Tests ──

describe("source-resolver", () => {
  describe("resolveAllSources", () => {
    test("resolves instruments from a GitHub source", async () => {
      const files: Record<string, string> = {
        "https://raw.githubusercontent.com/TestUser/my-instruments/main/tango.json":
          makeTangoJson(["./pr-tool", "./music-tool"]),
        "https://raw.githubusercontent.com/TestUser/my-instruments/main/pr-tool/package.json":
          makePackageJson({
            id: "pr-tool",
            name: "Pull Requests",
            category: "developer-tools",
            icon: "branch",
            description: "Manage PRs",
          }),
        "https://raw.githubusercontent.com/TestUser/my-instruments/main/music-tool/package.json":
          makePackageJson({
            id: "music-tool",
            name: "Music",
            category: "media",
            icon: "play",
          }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = files[url];
        if (body) return new Response(body, { status: 200 });
        return new Response("Not found", { status: 404 });
      };

      try {
        // Override source config by testing with a known source
        const { resolveAllSources: _ } = await import("../src/bun/instruments/source-resolver.ts");

        // We'll test the GitHub resolution directly via the module internals
        // For now, test the full flow by mocking loadSourceConfig indirectly
        // The simplest approach: just call with known installed IDs
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/my-instruments",
          { owner: "TestUser", repo: "my-instruments", branch: "main" },
          new Set(["pr-tool"]),
        );

        expect(results).toHaveLength(2);

        const pr = results.find((r) => r.id === "pr-tool")!;
        expect(pr.name).toBe("Pull Requests");
        expect(pr.category).toBe("developer-tools");
        expect(pr.icon).toBe("branch");
        expect(pr.installed).toBe(true);
        expect(pr.description).toBe("Manage PRs");
        expect(pr.author).toBe("TestUser");

        const music = results.find((r) => r.id === "music-tool")!;
        expect(music.name).toBe("Music");
        expect(music.category).toBe("media");
        expect(music.installed).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns empty array for missing tango.json", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response("Not found", { status: 404 });

      try {
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/empty-repo",
          { owner: "TestUser", repo: "empty-repo", branch: "main" },
          new Set(),
        );
        expect(results).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("skips instruments with invalid package.json", async () => {
      const files: Record<string, string> = {
        "https://raw.githubusercontent.com/TestUser/broken/main/tango.json":
          makeTangoJson(["./good", "./bad"]),
        "https://raw.githubusercontent.com/TestUser/broken/main/good/package.json":
          makePackageJson({ id: "good", name: "Good" }),
        "https://raw.githubusercontent.com/TestUser/broken/main/bad/package.json":
          "{ invalid json",
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = files[url];
        if (body) return new Response(body, { status: 200 });
        return new Response("Not found", { status: 404 });
      };

      try {
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/broken",
          { owner: "TestUser", repo: "broken", branch: "main" },
          new Set(),
        );
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("good");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles single-instrument repo with path '.'", async () => {
      const files: Record<string, string> = {
        "https://raw.githubusercontent.com/TestUser/solo/main/tango.json":
          makeTangoJson(["."]),
        "https://raw.githubusercontent.com/TestUser/solo/main/package.json":
          makePackageJson({ id: "solo-tool", name: "Solo", category: "utilities" }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = files[url];
        if (body) return new Response(body, { status: 200 });
        return new Response("Not found", { status: 404 });
      };

      try {
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/solo",
          { owner: "TestUser", repo: "solo", branch: "main" },
          new Set(),
        );
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("solo-tool");
        expect(results[0].path).toBe(".");
        expect(results[0].category).toBe("utilities");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("ignores invalid category values", async () => {
      const files: Record<string, string> = {
        "https://raw.githubusercontent.com/TestUser/cats/main/tango.json":
          makeTangoJson(["./inst"]),
        "https://raw.githubusercontent.com/TestUser/cats/main/inst/package.json":
          makePackageJson({ id: "inst", name: "Inst", category: "not-a-real-category" }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = files[url];
        if (body) return new Response(body, { status: 200 });
        return new Response("Not found", { status: 404 });
      };

      try {
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/cats",
          { owner: "TestUser", repo: "cats", branch: "main" },
          new Set(),
        );
        expect(results).toHaveLength(1);
        expect(results[0].category).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("supports custom branch via # syntax", async () => {
      const files: Record<string, string> = {
        "https://raw.githubusercontent.com/TestUser/repo/develop/tango.json":
          makeTangoJson(["./tool"]),
        "https://raw.githubusercontent.com/TestUser/repo/develop/tool/package.json":
          makePackageJson({ id: "tool", name: "Tool" }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = files[url];
        if (body) return new Response(body, { status: 200 });
        return new Response("Not found", { status: 404 });
      };

      try {
        const results = await resolveGitHubSourceDirect(
          "github:TestUser/repo#develop",
          { owner: "TestUser", repo: "repo", branch: "develop" },
          new Set(),
        );
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe("tool");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ── Direct access to resolveGitHubSource (not exported, so we re-implement the call) ──
// Since resolveGitHubSource is not exported, we use a thin wrapper that
// mimics what resolveAllSources does internally for a single GitHub source.

async function resolveGitHubSourceDirect(
  source: string,
  ref: { owner: string; repo: string; branch: string },
  installedIds: Set<string>,
) {
  // We need to access the internal function. Since it's not exported,
  // we'll import the module and use resolveAllSources with a mocked config.
  // But that requires mocking the file system too.
  // Simpler: export the function. Let's adjust.

  const { resolveGitHubSource } = await import("../src/bun/instruments/source-resolver.ts");
  return resolveGitHubSource(source, ref, installedIds);
}
