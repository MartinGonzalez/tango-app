import { describe, expect, test } from "bun:test";
import type { InstrumentRegistryEntry } from "../src/shared/types/instruments.ts";
import type { DevReloadRequest } from "../src/bun/instruments/dev-server.ts";

/**
 * Tests for the dev-reload handler auto-install logic.
 *
 * The handler is a pure function that takes:
 *   - a request { instrumentId, installPath }
 *   - instrumentRuntime-like methods (get, installFromPath, list)
 * And returns { ok, message, entries? }
 *
 * We import the extracted handler factory from dev-server.ts
 */
import { createDevReloadHandler } from "../src/bun/instruments/dev-server.ts";

function fakeEntry(overrides: Partial<InstrumentRegistryEntry> = {}): InstrumentRegistryEntry {
  return {
    id: "test-instrument",
    name: "Test",
    group: "test",
    source: "local",
    installPath: "/path/to/instrument",
    manifestPath: "/path/to/instrument/package.json",
    runtime: "react",
    entrypoint: "./dist/index.js",
    hostApiVersion: "1",
    panels: { sidebar: false, first: true, second: false, right: false },
    permissions: [],
    settings: [],
    enabled: true,
    status: "active",
    version: "0.0.1",
    isBundled: false,
    lastError: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("dev-reload handler", () => {
  test("already-installed instrument re-reads manifest and returns ok with entries", async () => {
    const entry = fakeEntry({ id: "my-instrument" });
    const reinstalledEntry = fakeEntry({ id: "my-instrument" });
    let installCalled = false;
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: (id) => (id === "my-instrument" ? entry : null),
      installFromPath: async (path) => {
        installCalled = true;
        expect(path).toBe("/path");
        return reinstalledEntry;
      },
      list: () => [reinstalledEntry],
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({ instrumentId: "my-instrument", installPath: "/path" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("my-instrument");
    expect(installCalled).toBe(true);
    expect(reinstalledEntry.devMode).toBe(true);
    // Should include entries since manifest is re-read
    expect(result.entries).toBeDefined();
    expect(result.entries).toEqual([reinstalledEntry]);
    expect(sentDevReload).not.toBeNull();
    expect(sentDevReload!.instrumentId).toBe("my-instrument");
    expect(sentDevReload!.entries).toEqual([reinstalledEntry]);
  });

  test("manifest changes are reflected after dev-reload of existing instrument", async () => {
    // Simulates: instrument installed with panels.first=false, then manifest changed to first=true
    const staleEntry = fakeEntry({
      id: "my-instrument",
      panels: { sidebar: false, first: false, second: false, right: false },
    });
    const freshEntry = fakeEntry({
      id: "my-instrument",
      panels: { sidebar: false, first: true, second: false, right: false },
    });
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: (id) => (id === "my-instrument" ? staleEntry : null),
      installFromPath: async () => freshEntry,
      list: () => [freshEntry],
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({ instrumentId: "my-instrument", installPath: "/path" });

    expect(result.ok).toBe(true);
    expect(freshEntry.devMode).toBe(true);
    // The entries sent to the webview should have the NEW panels config
    expect(sentDevReload!.entries![0].panels.first).toBe(true);
    expect(result.entries![0].panels.first).toBe(true);
  });

  test("not-installed instrument auto-installs and returns ok with entries", async () => {
    const installedEntry = fakeEntry({ id: "new-instrument" });
    const allEntries = [installedEntry];
    let installCalled = false;
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: () => null, // not found
      installFromPath: async (path) => {
        installCalled = true;
        expect(path).toBe("/path/to/new");
        return installedEntry;
      },
      list: () => allEntries,
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({
      instrumentId: "new-instrument",
      installPath: "/path/to/new",
    });

    expect(installCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.entries).toBeDefined();
    expect(result.entries).toEqual(allEntries);
    expect(installedEntry.devMode).toBe(true);
    expect(sentDevReload).not.toBeNull();
    expect(sentDevReload!.entries).toEqual(allEntries);
  });

  test("install failure for bundled instrument returns error", async () => {
    let sentDevReload: unknown = null;

    const handler = createDevReloadHandler({
      get: () => null,
      installFromPath: async () => {
        throw new Error(
          "Instrument 'some-id' is bundled and cannot be replaced by local install"
        );
      },
      list: () => [],
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({
      instrumentId: "some-id",
      installPath: "/path/to/bundled",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("bundled");
    expect(result.entries).toBeUndefined();
    // Should not send any reload message
    expect(sentDevReload).toBeNull();
  });
});
