import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnectorsStore } from "../src/bun/connectors-store.ts";

let tempDir: string;
let dbPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "connectors-store-test-"));
  dbPath = join(tempDir, "connectors.db");
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {}
});

describe("ConnectorsStore", () => {
  test("upserts and lists workspace connector records", () => {
    const store = new ConnectorsStore(dbPath);

    const upserted = store.upsertWorkspaceConnector({
      workspacePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalWorkspaceId: "T123",
      externalWorkspaceName: "Acme",
      externalUserId: "U123",
      scopes: ["channels:history", "groups:history"],
      tokenExpiresAt: "2026-03-01T00:00:00.000Z",
      lastError: null,
      keychainAccount: "workspace:abc",
    });

    expect(upserted.provider).toBe("slack");
    expect(upserted.status).toBe("connected");
    expect(upserted.externalWorkspaceId).toBe("T123");
    expect(upserted.keychainAccount).toBe("workspace:abc");

    const listed = store.listWorkspaceConnectors("/repo/a");
    expect(listed).toHaveLength(1);
    expect(listed[0].provider).toBe("slack");
    expect(listed[0].status).toBe("connected");
    expect(listed[0].scopes).toEqual(["channels:history", "groups:history"]);

    const jira = store.upsertWorkspaceConnector({
      workspacePath: "/repo/a",
      provider: "jira",
      status: "connected",
      externalWorkspaceId: "cloud-123",
      externalWorkspaceName: "Acme Jira",
      externalUserId: null,
      scopes: ["offline_access", "read:jira-work"],
      tokenExpiresAt: "2026-03-01T00:00:00.000Z",
      lastError: null,
      keychainAccount: "workspace:abc",
    });
    expect(jira.provider).toBe("jira");
    expect(jira.externalWorkspaceId).toBe("cloud-123");

    const listedWithJira = store.listWorkspaceConnectors("/repo/a");
    expect(listedWithJira).toHaveLength(2);
    expect(listedWithJira.map((entry) => entry.provider)).toEqual(["jira", "slack"]);

    const updated = store.upsertWorkspaceConnector({
      workspacePath: "/repo/a",
      provider: "slack",
      status: "error",
      externalWorkspaceId: "T123",
      externalWorkspaceName: "Acme",
      externalUserId: "U123",
      scopes: ["channels:history"],
      tokenExpiresAt: null,
      lastError: "token expired",
      keychainAccount: "workspace:abc",
    });
    expect(updated.status).toBe("error");
    expect(updated.lastError).toBe("token expired");

    store.deleteWorkspaceConnector("/repo/a", "slack");
    expect(store.listWorkspaceConnectors("/repo/a").map((entry) => entry.provider)).toEqual([
      "jira",
    ]);
    store.deleteWorkspaceConnector("/repo/a", "jira");
    expect(store.listWorkspaceConnectors("/repo/a")).toEqual([]);
    store.close();
  });
});
