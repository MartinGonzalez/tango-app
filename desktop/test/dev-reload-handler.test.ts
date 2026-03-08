import { describe, expect, test } from "bun:test";
import type { InstrumentRegistryEntry } from "../src/shared/types/instruments.ts";
import type { DevReloadRequest } from "../src/bun/instruments/dev-server.ts";

/**
 * Tests for the dev-reload handler.
 *
 * Dev entries use a `::dev` suffixed id so marketplace and dev versions
 * coexist side by side. The handler uses installDevOverride (in-memory only)
 * so the registry is never touched.
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
  test("creates dev entry with ::dev suffix alongside marketplace entry", async () => {
    const marketplaceEntry = fakeEntry({ id: "my-instrument" });
    const devEntry = fakeEntry({ id: "my-instrument::dev", devMode: true });
    let installPath = "";
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: (id) => {
        if (id === "my-instrument") return marketplaceEntry;
        if (id === "my-instrument::dev") return null; // first time
        return null;
      },
      installDevOverride: async (path) => {
        installPath = path;
        return devEntry;
      },
      // list() returns both marketplace + dev
      list: () => [marketplaceEntry, devEntry],
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({ instrumentId: "my-instrument", installPath: "/path" });

    expect(result.ok).toBe(true);
    expect(installPath).toBe("/path");
    // Entries contain both marketplace and dev
    expect(result.entries).toHaveLength(2);
    expect(result.entries![0].id).toBe("my-instrument");
    expect(result.entries![1].id).toBe("my-instrument::dev");
    // Frontend receives dev id for activation
    expect(sentDevReload!.instrumentId).toBe("my-instrument::dev");
  });

  test("reload of existing dev entry re-reads manifest", async () => {
    const staleDevEntry = fakeEntry({
      id: "my-instrument::dev",
      devMode: true,
      panels: { sidebar: false, first: false, second: false, right: false },
    });
    const freshDevEntry = fakeEntry({
      id: "my-instrument::dev",
      devMode: true,
      panels: { sidebar: false, first: true, second: false, right: false },
    });
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: (id) => (id === "my-instrument::dev" ? staleDevEntry : null),
      installDevOverride: async () => freshDevEntry,
      list: () => [freshDevEntry],
      sendDevReload: (msg) => {
        sentDevReload = msg;
      },
    });

    const result = await handler({ instrumentId: "my-instrument", installPath: "/path" });

    expect(result.ok).toBe(true);
    expect(sentDevReload!.entries![0].panels.first).toBe(true);
  });

  test("new instrument without marketplace version auto-installs as dev", async () => {
    const devEntry = fakeEntry({ id: "new-instrument::dev", devMode: true });
    let installCalled = false;
    let sentDevReload: { instrumentId: string; entries?: InstrumentRegistryEntry[] } | null = null;

    const handler = createDevReloadHandler({
      get: () => null,
      installDevOverride: async (path) => {
        installCalled = true;
        expect(path).toBe("/path/to/new");
        return devEntry;
      },
      list: () => [devEntry],
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
    expect(sentDevReload!.instrumentId).toBe("new-instrument::dev");
  });

  test("install failure for bundled instrument returns error", async () => {
    let sentDevReload: unknown = null;

    const handler = createDevReloadHandler({
      get: () => null,
      installDevOverride: async () => {
        throw new Error(
          "Instrument 'some-id' is bundled and cannot be overridden by dev mode"
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
    expect(sentDevReload).toBeNull();
  });
});
