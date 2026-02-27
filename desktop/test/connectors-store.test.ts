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
  test("upserts and lists stage connector records", () => {
    const store = new ConnectorsStore(dbPath);

    const upserted = store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalStageId: "T123",
      externalStageName: "Acme",
      externalUserId: "U123",
      scopes: ["channels:history", "groups:history"],
      tokenExpiresAt: "2026-03-01T00:00:00.000Z",
      lastError: null,
      keychainAccount: "stage:abc",
    });

    expect(upserted.provider).toBe("slack");
    expect(upserted.status).toBe("connected");
    expect(upserted.externalStageId).toBe("T123");
    expect(upserted.keychainAccount).toBe("stage:abc");

    const listed = store.listStageConnectors("/repo/a");
    expect(listed).toHaveLength(1);
    expect(listed[0].provider).toBe("slack");
    expect(listed[0].status).toBe("connected");
    expect(listed[0].scopes).toEqual(["channels:history", "groups:history"]);

    const jira = store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "jira",
      status: "connected",
      externalStageId: "cloud-123",
      externalStageName: "Acme Jira",
      externalUserId: null,
      scopes: ["offline_access", "read:jira-work"],
      tokenExpiresAt: "2026-03-01T00:00:00.000Z",
      lastError: null,
      keychainAccount: "stage:abc",
    });
    expect(jira.provider).toBe("jira");
    expect(jira.externalStageId).toBe("cloud-123");

    const listedWithJira = store.listStageConnectors("/repo/a");
    expect(listedWithJira).toHaveLength(2);
    expect(listedWithJira.map((entry) => entry.provider)).toEqual(["jira", "slack"]);

    const updated = store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "slack",
      status: "error",
      externalStageId: "T123",
      externalStageName: "Acme",
      externalUserId: "U123",
      scopes: ["channels:history"],
      tokenExpiresAt: null,
      lastError: "token expired",
      keychainAccount: "stage:abc",
    });
    expect(updated.status).toBe("error");
    expect(updated.lastError).toBe("token expired");

    store.deleteStageConnector("/repo/a", "slack");
    expect(store.listStageConnectors("/repo/a").map((entry) => entry.provider)).toEqual([
      "jira",
    ]);
    store.deleteStageConnector("/repo/a", "jira");
    expect(store.listStageConnectors("/repo/a")).toEqual([]);
    store.close();
  });
});
