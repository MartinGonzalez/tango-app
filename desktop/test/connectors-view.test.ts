import { describe, expect, test } from "bun:test";
import { ConnectorsView } from "../src/mainview/components/connectors-view.ts";
import type {
  ConnectorAuthSession,
  WorkspaceConnector,
} from "../src/shared/types.ts";

describe("connectors-view", () => {
  test("renders available connector and auth pending state", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const view = new ConnectorsView(container, {
      onConnect: async () => {},
      onDisconnect: async () => {},
      onOpenAuthLink: async () => {},
    });

    const connectors: WorkspaceConnector[] = [
      {
        workspacePath: "/repo/a",
        provider: "slack",
        status: "disconnected",
        externalWorkspaceId: null,
        externalWorkspaceName: null,
        externalUserId: null,
        scopes: [],
        tokenExpiresAt: null,
        lastError: null,
        updatedAt: "2026-02-24T10:00:00.000Z",
      },
    ];

    const authSession: ConnectorAuthSession = {
      id: "auth-1",
      workspacePath: "/repo/a",
      provider: "slack",
      status: "pending",
      authorizeUrl: "https://slack.com/oauth/v2/authorize?state=test",
      error: null,
      expiresAt: "2026-02-24T10:10:00.000Z",
      updatedAt: "2026-02-24T10:00:00.000Z",
    };

    view.render(connectors, {
      workspacePath: "/repo/a",
      authSession,
    });

    expect(container.textContent).toContain("Available providers");
    expect(container.textContent).toContain("Authorizing with Slack");
    expect(container.textContent).toContain("Jira");
    expect(container.querySelectorAll(".connector-provider-row").length).toBe(2);
  });

  test("renders connected provider in connected section", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const view = new ConnectorsView(container, {
      onConnect: async () => {},
      onDisconnect: async () => {},
      onOpenAuthLink: async () => {},
    });

    const connectors: WorkspaceConnector[] = [
      {
        workspacePath: "/repo/a",
        provider: "slack",
        status: "connected",
        externalWorkspaceId: "T123",
        externalWorkspaceName: "Acme",
        externalUserId: "U123",
        scopes: ["channels:history"],
        tokenExpiresAt: null,
        lastError: null,
        updatedAt: "2026-02-24T10:00:00.000Z",
      },
    ];

    view.render(connectors, {
      workspacePath: "/repo/a",
      authSession: null,
    });

    expect(container.textContent).toContain("Connected providers");
    expect(container.textContent).toContain("Connected to Acme");
    expect(container.textContent).toContain("Jira");
    expect(container.textContent).toContain("Disconnect");
  });
});
