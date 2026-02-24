import { describe, expect, test } from "bun:test";
import { ConnectorsRepository } from "../src/bun/connectors-repository.ts";
import type { ConnectorProvider, WorkspaceConnector } from "../src/shared/types.ts";
import type { WorkspaceConnectorRecord } from "../src/bun/connectors-store.ts";

const SLACK_KEYCHAIN_SERVICE = "dev.claude-sessions.app.connectors.slack";
const JIRA_KEYCHAIN_SERVICE = "dev.claude-sessions.app.connectors.jira";

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

    const connectors = await repo.listWorkspaceConnectors("/repo/a");
    expect(connectors).toHaveLength(2);
    const slack = connectors.find((entry) => entry.provider === "slack");
    expect(slack?.status).toBe("connected");
    const jira = connectors.find((entry) => entry.provider === "jira");
    expect(jira?.status).toBe("disconnected");
    const stored = store.getWorkspaceConnectorRecord("/repo/a", "slack");
    expect(stored).not.toBeNull();
    expect(stored?.keychainAccount).toMatch(/^workspace:[a-f0-9]{64}$/);

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

    store.upsertWorkspaceConnector({
      workspacePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalWorkspaceId: "T1",
      externalWorkspaceName: "Acme",
      externalUserId: "U1",
      scopes: ["channels:history"],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      lastError: null,
      keychainAccount: "workspace:test",
    });
    await keychain.setSecret(SLACK_KEYCHAIN_SERVICE, "workspace:test", JSON.stringify({
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
    const connectors = await repo.listWorkspaceConnectors("/repo/a");
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

    store.upsertWorkspaceConnector({
      workspacePath: "/repo/a",
      provider: "slack",
      status: "connected",
      externalWorkspaceId: "T1",
      externalWorkspaceName: "Acme",
      externalUserId: "U1",
      scopes: ["channels:history"],
      tokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      lastError: null,
      keychainAccount: "workspace:test",
    });
    await keychain.setSecret(SLACK_KEYCHAIN_SERVICE, "workspace:test", JSON.stringify({
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

    const connectors = await repo.listWorkspaceConnectors("/repo/a");
    const slack = connectors.find((entry) => entry.provider === "slack");
    expect(slack?.status).toBe("error");
    expect(slack?.lastError).toContain("invalid_auth");
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

    const connectors = await repo.listWorkspaceConnectors("/repo/a");
    const jira = connectors.find((entry) => entry.provider === "jira");
    expect(jira?.status).toBe("connected");
    expect(jira?.externalWorkspaceId).toBe("cloud-1");

    const stored = store.getWorkspaceConnectorRecord("/repo/a", "jira");
    expect(stored).not.toBeNull();
    const secret = await keychain.getSecret(
      JIRA_KEYCHAIN_SERVICE,
      String(stored?.keychainAccount)
    );
    expect(secret).toContain("jira-access");
  });
});

class MemoryConnectorsStore {
  #records = new Map<string, WorkspaceConnectorRecord>();

  close(): void {}

  listWorkspaceConnectors(workspacePath: string): WorkspaceConnector[] {
    return this.listWorkspaceConnectorRecords(workspacePath).map((record) => ({
      workspacePath: record.workspacePath,
      provider: record.provider,
      status: record.status,
      externalWorkspaceId: record.externalWorkspaceId,
      externalWorkspaceName: record.externalWorkspaceName,
      externalUserId: record.externalUserId,
      scopes: [...record.scopes],
      tokenExpiresAt: record.tokenExpiresAt,
      lastError: record.lastError,
      updatedAt: record.updatedAt,
    }));
  }

  listWorkspaceConnectorRecords(workspacePath: string): WorkspaceConnectorRecord[] {
    const entries: WorkspaceConnectorRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.workspacePath !== workspacePath) continue;
      entries.push({ ...record, scopes: [...record.scopes] });
    }
    return entries;
  }

  getWorkspaceConnectorRecord(
    workspacePath: string,
    provider: ConnectorProvider
  ): WorkspaceConnectorRecord | null {
    return this.#records.get(makeKey(workspacePath, provider)) ?? null;
  }

  upsertWorkspaceConnector(input: {
    workspacePath: string;
    provider: ConnectorProvider;
    status: "connected" | "disconnected" | "error";
    externalWorkspaceId?: string | null;
    externalWorkspaceName?: string | null;
    externalUserId?: string | null;
    scopes?: string[];
    tokenExpiresAt?: string | null;
    lastError?: string | null;
    keychainAccount?: string | null;
  }): WorkspaceConnectorRecord {
    const key = makeKey(input.workspacePath, input.provider);
    const existing = this.#records.get(key);
    const now = new Date().toISOString();
    const next: WorkspaceConnectorRecord = {
      workspacePath: input.workspacePath,
      provider: input.provider,
      status: input.status,
      externalWorkspaceId: input.externalWorkspaceId ?? existing?.externalWorkspaceId ?? null,
      externalWorkspaceName: input.externalWorkspaceName ?? existing?.externalWorkspaceName ?? null,
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

  deleteWorkspaceConnector(workspacePath: string, provider: ConnectorProvider): void {
    this.#records.delete(makeKey(workspacePath, provider));
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
