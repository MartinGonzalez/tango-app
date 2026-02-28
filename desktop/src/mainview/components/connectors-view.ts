import { clearChildren, h } from "../lib/dom.ts";
import type {
  ConnectorAuthSession,
  ConnectorProvider,
  StageConnector,
} from "../../shared/types.ts";

export type ConnectorsViewCallbacks = {
  onConnect: (provider: ConnectorProvider) => Promise<void>;
  onDisconnect: (provider: ConnectorProvider) => Promise<void>;
  onOpenAuthLink: (provider: ConnectorProvider) => Promise<void>;
};

type ConnectorProviderMeta = {
  label: string;
  description: string;
};

const CONNECTOR_PROVIDERS: ConnectorProvider[] = ["slack", "jira"];
const CONNECTOR_PROVIDER_META: Record<ConnectorProvider, ConnectorProviderMeta> = {
  slack: {
    label: "Slack",
    description: "Read Slack threads into task sources",
  },
  jira: {
    label: "Jira",
    description: "Read Jira issues into task sources",
  },
};

export class ConnectorsView {
  #el: HTMLElement;
  #bodyEl: HTMLElement;
  #callbacks: ConnectorsViewCallbacks;
  #connectors: StageConnector[] = [];
  #loading = false;
  #authSession: ConnectorAuthSession | null = null;
  #stagePath: string | null = null;
  #actionInFlight: string | null = null;

  constructor(container: HTMLElement | null, callbacks: ConnectorsViewCallbacks) {
    this.#callbacks = callbacks;
    this.#bodyEl = h("div", { class: "connectors-view-body" });
    this.#el = h("section", { class: "connectors-view" }, [
      this.#bodyEl,
    ]);
    if (container) container.appendChild(this.#el);
  }

  render(
    connectors: StageConnector[],
    opts?: {
      loading?: boolean;
      authSession?: ConnectorAuthSession | null;
      stagePath?: string | null;
    }
  ): void {
    this.#connectors = connectors;
    this.#loading = Boolean(opts?.loading);
    this.#authSession = opts?.authSession ?? null;
    this.#stagePath = opts?.stagePath ?? null;
    this.#renderContent();
  }

  setVisible(visible: boolean): void {
    this.#el.hidden = !visible;
  }

  #renderContent(): void {
    clearChildren(this.#bodyEl);

    if (!this.#stagePath) {
      this.#bodyEl.appendChild(
        h("div", { class: "connectors-view-empty" }, ["Select a stage to manage connectors"])
      );
      return;
    }

    if (this.#loading) {
      this.#bodyEl.appendChild(
        h("div", { class: "connectors-view-empty" }, ["Loading connectors..."])
      );
      return;
    }

    const providers = CONNECTOR_PROVIDERS.map((provider) =>
      this.#connectors.find((entry) => entry.provider === provider)
      ?? defaultConnector(this.#stagePath!, provider)
    );

    const connected = providers.filter((entry) => entry.status === "connected");
    const available = providers.filter((entry) => entry.status !== "connected");

    const card = h("div", { class: "connectors-card" }, [
      h("div", { class: "connectors-stage-label" }, [stageName(this.#stagePath)]),
      h("section", { class: "connectors-section" }, [
        h("h3", { class: "connectors-section-title" }, ["Connected providers"]),
        connected.length > 0
          ? h("div", { class: "connectors-list" }, connected.map((entry) =>
              this.#renderProviderRow(entry)
            ))
          : h("div", { class: "connectors-section-empty" }, ["No connected providers"]),
      ]),
      h("section", { class: "connectors-section" }, [
        h("h3", { class: "connectors-section-title" }, ["Available providers"]),
        available.length > 0
          ? h("div", { class: "connectors-list" }, available.map((entry) =>
              this.#renderProviderRow(entry)
            ))
          : h("div", { class: "connectors-section-empty" }, ["No available providers"]),
      ]),
      this.#authSession
        ? this.#renderAuthState(this.#authSession)
        : h("div", { hidden: true }),
    ]);

    this.#bodyEl.appendChild(card);
  }

  #renderProviderRow(connector: StageConnector): HTMLElement {
    const meta = CONNECTOR_PROVIDER_META[connector.provider];
    const isConnected = connector.status === "connected";
    const action = isConnected ? "disconnect" : "connect";
    const actionKey = `${action}:${connector.provider}`;
    const inFlight = this.#actionInFlight === actionKey;

    const description = isConnected
      ? (connector.externalStageName
        ? `Connected to ${connector.externalStageName}`
        : "Connected")
      : meta.description;

    const statusBadge = isConnected
      ? h("span", { class: "connector-provider-badge connector-provider-badge-connected" }, ["Connected"])
      : connector.status === "error"
        ? h("span", { class: "connector-provider-badge connector-provider-badge-error" }, ["Error"])
        : h("span", { class: "connector-provider-badge" }, ["Available"]);

    return h("div", { class: "connector-provider-row" }, [
      h("div", { class: "connector-provider-info" }, [
        h("div", { class: "connector-provider-title-row" }, [
          h("span", { class: "connector-provider-title" }, [meta.label]),
          statusBadge,
        ]),
        h("div", { class: "connector-provider-description" }, [description]),
        connector.lastError
          ? h("div", { class: "connector-provider-error" }, [connector.lastError])
          : h("div", { class: "connector-provider-error", hidden: true }),
      ]),
      h("button", {
        class: `connector-provider-btn${isConnected ? " is-danger" : ""}`,
        disabled: inFlight,
        onclick: async () => {
          if (this.#actionInFlight) return;
          this.#actionInFlight = actionKey;
          this.#renderContent();
          try {
            if (isConnected) {
              await this.#callbacks.onDisconnect(connector.provider);
            } else {
              await this.#callbacks.onConnect(connector.provider);
            }
          } finally {
            this.#actionInFlight = null;
            this.#renderContent();
          }
        },
      }, [inFlight ? (isConnected ? "Disconnecting..." : "Connecting...") : (isConnected ? "Disconnect" : "Connect")]),
    ]);
  }

  #renderAuthState(authSession: ConnectorAuthSession): HTMLElement {
    const meta = CONNECTOR_PROVIDER_META[authSession.provider];
    const pending = authSession.status === "pending";
    const failed = authSession.status === "failed" || authSession.status === "expired";
    const actionKey = `open-link:${authSession.provider}`;
    const inFlight = this.#actionInFlight === actionKey;
    return h("section", { class: "connectors-auth-state" }, [
      h("h3", { class: "connectors-section-title" }, ["Authorization"]),
      pending
        ? h("div", { class: "connectors-auth-message" }, [`Authorizing with ${meta.label}...`])
        : failed
          ? h("div", { class: "connectors-auth-message connectors-auth-message-error" }, [
              authSession.error ?? "Authorization failed. Retry connection.",
            ])
          : h("div", { class: "connectors-auth-message connectors-auth-message-success" }, [
              `${meta.label} authorization completed.`,
            ]),
      h("div", { class: "connectors-auth-actions" }, [
        h("button", {
          class: "connector-provider-btn",
          disabled: !authSession.authorizeUrl || inFlight,
          onclick: async () => {
            if (!authSession.authorizeUrl || this.#actionInFlight) return;
            this.#actionInFlight = actionKey;
            this.#renderContent();
            try {
              await this.#callbacks.onOpenAuthLink(authSession.provider);
            } finally {
              this.#actionInFlight = null;
              this.#renderContent();
            }
          },
        }, [inFlight ? "Opening..." : "Open Link"]),
      ]),
    ]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function defaultConnector(
  stagePath: string,
  provider: ConnectorProvider
): StageConnector {
  return {
    stagePath,
    provider,
    status: "disconnected",
    externalStageId: null,
    externalStageName: null,
    externalUserId: null,
    scopes: [],
    tokenExpiresAt: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

function stageName(stagePath: string): string {
  return stagePath.split("/").filter(Boolean).at(-1) ?? stagePath;
}
