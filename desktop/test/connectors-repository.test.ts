import { describe, expect, test } from "bun:test";
import { ConnectorsRepository } from "../src/bun/connectors-repository.ts";
import type { ConnectorProvider, StageConnector } from "../src/shared/types.ts";
import type { StageConnectorRecord } from "../src/bun/connectors-store.ts";

const SLACK_KEYCHAIN_SERVICE = "dev.tango.app.connectors.slack";
const JIRA_KEYCHAIN_SERVICE = "dev.tango.app.connectors.jira";

describe("ConnectorsRepository", () => {
  test("starts auth session and completes Slack OAuth callback", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async (_url, init) => {
        const body = String(init?.body ?? "");
        if (body.includes("grant_type=authorization_code")) {
          return Response.json({
            ok: true,
            team: { id: "T123", name: "Acme" },
            authed_user: {
              id: "U123",
              access_token: "xoxp-access",
              refresh_token: "xoxe-refresh",
              expires_in: 3600,
              scope: "channels:history,groups:history",
              token_type: "user",
            },
          });
        }
        return Response.json({ ok: false, error: "unexpected" }, { status: 400 });
      },
    });

    const auth = await repo.startConnectorAuth("/repo/a", "slack");
    expect(auth.status).toBe("pending");
    expect(auth.authorizeUrl).toContain("slack.com/oauth/v2/authorize");

    const state = new URL(auth.authorizeUrl!).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await repo.handleOAuthCallback({
      state,
      code: "auth-code",
      error: null,
      errorDescription: null,
    });
    expect(callback.ok).toBe(true);

    const status = await repo.getConnectorAuthStatus(auth.id);
    expect(status.status).toBe("completed");

    const connectors = await repo.listStageConnectors("/repo/a");
    expect(connectors).toHaveLength(2);
    const slack = connectors.find((entry) => entry.provider === "slack");
    expect(slack?.status).toBe("connected");
    const jira = connectors.find((entry) => entry.provider === "jira");
    expect(jira?.status).toBe("disconnected");
    const stored = store.getStageConnectorRecord("/repo/a", "slack");
    expect(stored).not.toBeNull();
    expect(stored?.keychainAccount).toMatch(/^stage:[a-f0-9]{64}$/);

    const token = await repo.getSlackAccessToken("/repo/a");
    expect(token).toBe("xoxp-access");
  });

  test("returns failed callback for invalid state", async () => {
    const repo = new ConnectorsRepository({
      store: new MemoryConnectorsStore(),
      keychain: new MemoryKeychainStore(),
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async () => Response.json({ ok: false }),
    });

    const result = await repo.handleOAuthCallback({
      state: "missing-state",
      code: "abc",
      error: null,
      errorDescription: null,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Invalid or expired OAuth state");
  });

  test("expires pending auth sessions", async () => {
    const repo = new ConnectorsRepository({
      store: new MemoryConnectorsStore(),
      keychain: new MemoryKeychainStore(),
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async () => Response.json({ ok: false }),
      authSessionTtlMs: 25,
    });

    const auth = await repo.startConnectorAuth("/repo/a", "slack");
    expect(auth.status).toBe("pending");

    await Bun.sleep(60);
    const status = await repo.getConnectorAuthStatus(auth.id);
    expect(status.status).toBe("expired");
  });

  test("refreshes expired Slack token when refresh_token is available", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async () => Response.json({
        ok: true,
        authed_user: {
          access_token: "xoxp-fresh",
          refresh_token: "xoxe-next",
          expires_in: 7200,
          scope: "channels:history",
          token_type: "user",
        },
      }),
    });

    store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalStageId: "T1",
      externalStageName: "Acme",
      externalUserId: "U1",
      scopes: ["channels:history"],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      lastError: null,
      keychainAccount: "stage:test",
    });
    await keychain.setSecret(SLACK_KEYCHAIN_SERVICE, "stage:test", JSON.stringify({
      accessToken: "xoxp-old",
      refreshToken: "xoxe-refresh",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      scope: "channels:history",
      tokenType: "user",
      teamId: "T1",
      teamName: "Acme",
      userId: "U1",
    }));

    const accessToken = await repo.getSlackAccessToken("/repo/a");
    expect(accessToken).toBe("xoxp-fresh");
    const connectors = await repo.listStageConnectors("/repo/a");
    const slack = connectors.find((entry) => entry.provider === "slack");
    expect(slack?.status).toBe("connected");
    expect(slack?.lastError).toBeNull();
  });

  test("marks connector as error when refresh fails", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async () => Response.json({
        ok: false,
        error: "invalid_auth",
      }),
    });

    store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalStageId: "T1",
      externalStageName: "Acme",
      externalUserId: "U1",
      scopes: ["channels:history"],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      lastError: null,
      keychainAccount: "stage:test",
    });
    await keychain.setSecret(SLACK_KEYCHAIN_SERVICE, "stage:test", JSON.stringify({
      accessToken: "xoxp-old",
      refreshToken: "xoxe-refresh",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      scope: "channels:history",
      tokenType: "user",
      teamId: "T1",
      teamName: "Acme",
      userId: "U1",
    }));

    await expect(repo.getSlackAccessToken("/repo/a")).rejects.toThrow(
      "Connect Slack in Connectors to fetch this source"
    );

    const connectors = await repo.listStageConnectors("/repo/a");
    const slack = connectors.find((entry) => entry.provider === "slack");
    expect(slack?.status).toBe("error");
    expect(slack?.lastError).toContain("invalid_auth");
  });

  test("returns Slack connector credential payload via generic API", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      slackClientId: "test-client-id",
      slackClientSecret: "test-client-secret",
      fetchImpl: async () => Response.json({
        ok: true,
        authed_user: {
          access_token: "xoxp-fresh",
          refresh_token: "xoxe-next",
          expires_in: 3600,
          scope: "channels:history",
          token_type: "user",
        },
      }),
    });

    const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
    store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalStageId: "T1",
      externalStageName: "Acme Team",
      externalUserId: "U1",
      scopes: ["channels:history"],
      tokenExpiresAt: futureExpiry,
      lastError: null,
      keychainAccount: "stage:test",
    });
    await keychain.setSecret(SLACK_KEYCHAIN_SERVICE, "stage:test", JSON.stringify({
      accessToken: "xoxp-access",
      refreshToken: "xoxe-refresh",
      expiresAt: futureExpiry,
      scope: "channels:history",
      tokenType: "user",
      teamId: "T1",
      teamName: "Acme Team",
      userId: "U1",
    }));

    const credential = await repo.getConnectorCredential("/repo/a", "slack");
    expect(credential.provider).toBe("slack");
    expect(credential.accessToken).toBe("xoxp-access");
    expect(credential.scopes).toContain("channels:history");
    expect(credential.metadata?.teamId).toBe("T1");
    expect(credential.metadata?.userId).toBe("U1");
  });

  test("starts auth session and completes Jira OAuth callback", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      jiraClientId: "jira-client-id",
      jiraClientSecret: "jira-client-secret",
      fetchImpl: async (url, init) => {
        const target = String(url);
        if (target.includes("/oauth/token/accessible-resources")) {
          return Response.json([{
            id: "cloud-1",
            name: "Acme Jira",
            url: "https://acme.atlassian.net",
            scopes: ["read:jira-work"],
          }]);
        }

        if (target.includes("/oauth/token")) {
          const body = String(init?.body ?? "");
          expect(body).toContain("\"grant_type\":\"authorization_code\"");
          return Response.json({
            access_token: "jira-access",
            refresh_token: "jira-refresh",
            expires_in: 3600,
            scope: "read:jira-work read:jira-user offline_access",
            token_type: "Bearer",
          });
        }

        return Response.json({ error: "unexpected" }, { status: 400 });
      },
    });

    const auth = await repo.startConnectorAuth("/repo/a", "jira");
    expect(auth.status).toBe("pending");
    expect(auth.authorizeUrl).toContain("auth.atlassian.com/authorize");

    const state = new URL(auth.authorizeUrl!).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await repo.handleOAuthCallback({
      state,
      code: "jira-code",
      error: null,
      errorDescription: null,
    });
    expect(callback.ok).toBe(true);

    const status = await repo.getConnectorAuthStatus(auth.id);
    expect(status.status).toBe("completed");

    const connectors = await repo.listStageConnectors("/repo/a");
    const jira = connectors.find((entry) => entry.provider === "jira");
    expect(jira?.status).toBe("connected");
    expect(jira?.externalStageId).toBe("cloud-1");

    const stored = store.getStageConnectorRecord("/repo/a", "jira");
    expect(stored).not.toBeNull();
    const secret = await keychain.getSecret(
      JIRA_KEYCHAIN_SERVICE,
      String(stored?.keychainAccount)
    );
    expect(secret).toContain("jira-access");
  });

  test("returns Jira connector credential payload via generic API", async () => {
    const store = new MemoryConnectorsStore();
    const keychain = new MemoryKeychainStore();
    const repo = new ConnectorsRepository({
      store,
      keychain,
      oauthServer: fakeOAuthServer(),
      jiraClientId: "jira-client-id",
      jiraClientSecret: "jira-client-secret",
      fetchImpl: async () => Response.json({ error: "unexpected" }, { status: 400 }),
    });

    const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
    store.upsertStageConnector({
      stagePath: "/repo/a",
      provider: "jira",
      status: "connected",
      externalStageId: "cloud-1",
      externalStageName: "Acme Jira",
      externalUserId: "user-1",
      scopes: ["read:jira-work", "read:jira-user"],
      tokenExpiresAt: futureExpiry,
      lastError: null,
      keychainAccount: "stage:test",
    });
    await keychain.setSecret(JIRA_KEYCHAIN_SERVICE, "stage:test", JSON.stringify({
      accessToken: "jira-access",
      refreshToken: "jira-refresh",
      expiresAt: futureExpiry,
      scope: "read:jira-work read:jira-user offline_access",
      tokenType: "Bearer",
      cloudId: "cloud-1",
      cloudName: "Acme Jira",
      cloudUrl: "https://acme.atlassian.net",
      userAccountId: "user-1",
    }));

    const credential = await repo.getConnectorCredential("/repo/a", "jira");
    expect(credential.provider).toBe("jira");
    expect(credential.accessToken).toBe("jira-access");
    expect(credential.scopes).toContain("read:jira-work");
    expect(credential.metadata?.cloudId).toBe("cloud-1");
    expect(credential.metadata?.userAccountId).toBe("user-1");
  });
});

class MemoryConnectorsStore {
  #records = new Map<string, StageConnectorRecord>();

  close(): void {}

  listStageConnectors(stagePath: string): StageConnector[] {
    return this.listStageConnectorRecords(stagePath).map((record) => ({
      stagePath: record.stagePath,
      provider: record.provider,
      status: record.status,
      externalStageId: record.externalStageId,
      externalStageName: record.externalStageName,
      externalUserId: record.externalUserId,
      scopes: [...record.scopes],
      tokenExpiresAt: record.tokenExpiresAt,
      lastError: record.lastError,
      updatedAt: record.updatedAt,
    }));
  }

  listStageConnectorRecords(stagePath: string): StageConnectorRecord[] {
    const entries: StageConnectorRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.stagePath !== stagePath) continue;
      entries.push({ ...record, scopes: [...record.scopes] });
    }
    return entries;
  }

  getStageConnectorRecord(
    stagePath: string,
    provider: ConnectorProvider
  ): StageConnectorRecord | null {
    return this.#records.get(makeKey(stagePath, provider)) ?? null;
  }

  upsertStageConnector(input: {
    stagePath: string;
    provider: ConnectorProvider;
    status: "connected" | "disconnected" | "error";
    externalStageId?: string | null;
    externalStageName?: string | null;
    externalUserId?: string | null;
    scopes?: string[];
    tokenExpiresAt?: string | null;
    lastError?: string | null;
    keychainAccount?: string | null;
  }): StageConnectorRecord {
    const key = makeKey(input.stagePath, input.provider);
    const existing = this.#records.get(key);
    const now = new Date().toISOString();
    const next: StageConnectorRecord = {
      stagePath: input.stagePath,
      provider: input.provider,
      status: input.status,
      externalStageId: input.externalStageId ?? existing?.externalStageId ?? null,
      externalStageName: input.externalStageName ?? existing?.externalStageName ?? null,
      externalUserId: input.externalUserId ?? existing?.externalUserId ?? null,
      scopes: [...(input.scopes ?? existing?.scopes ?? [])],
      tokenExpiresAt: input.tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      lastError: input.lastError ?? existing?.lastError ?? null,
      keychainAccount: input.keychainAccount ?? existing?.keychainAccount ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.#records.set(key, next);
    return next;
  }

  deleteStageConnector(stagePath: string, provider: ConnectorProvider): void {
    this.#records.delete(makeKey(stagePath, provider));
  }
}

class MemoryKeychainStore {
  #store = new Map<string, string>();

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    this.#store.set(makeKey(service, account), secret);
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    return this.#store.get(makeKey(service, account)) ?? null;
  }

  async deleteSecret(service: string, account: string): Promise<void> {
    this.#store.delete(makeKey(service, account));
  }
}

function fakeOAuthServer() {
  return {
    status: {
      ready: true,
      trusted: true,
      message: null,
      port: 4344,
      keyPath: "/tmp/key.pem",
      certPath: "/tmp/cert.pem",
    },
    start: async () => {},
    stop: () => {},
  };
}

function makeKey(...parts: string[]): string {
  return parts.join("::");
}
