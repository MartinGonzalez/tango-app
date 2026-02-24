import { createHash, randomBytes } from "node:crypto";
import {
  ConnectorOAuthServer,
  type ConnectorOAuthServerStatus,
  type OAuthCallbackPayload,
  type OAuthCallbackResult,
} from "./connector-oauth-server.ts";
import { ConnectorsStore, type WorkspaceConnectorRecord } from "./connectors-store.ts";
import { KeychainStore } from "./keychain-store.ts";
import type {
  ConnectorAuthSession,
  ConnectorAuthSessionStatus,
  ConnectorProvider,
  WorkspaceConnector,
} from "../shared/types.ts";

const CONNECTOR_PROVIDERS: ConnectorProvider[] = ["slack", "jira"];

const SLACK_PROVIDER: ConnectorProvider = "slack";
const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_REDIRECT_URI = "https://localhost:4344/oauth/slack/callback";
const SLACK_USER_SCOPES = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
];
const DEFAULT_SLACK_CLIENT_ID = "14806268916.10567553911219";
const SLACK_CLIENT_ID = process.env.CLAUDEX_SLACK_CLIENT_ID?.trim()
  || DEFAULT_SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.CLAUDEX_SLACK_CLIENT_SECRET?.trim() || "";
const SLACK_KEYCHAIN_SERVICE = "dev.claude-sessions.app.connectors.slack";

const JIRA_PROVIDER: ConnectorProvider = "jira";
const JIRA_AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const JIRA_ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";
const JIRA_REDIRECT_URI = "https://localhost:4344/oauth/jira/callback";
const JIRA_SCOPES = [
  "offline_access",
  "read:jira-user",
  "read:jira-work",
];
const JIRA_CLIENT_ID = process.env.CLAUDEX_JIRA_CLIENT_ID?.trim() || "";
const JIRA_CLIENT_SECRET = process.env.CLAUDEX_JIRA_CLIENT_SECRET?.trim() || "";
const JIRA_KEYCHAIN_SERVICE = "dev.claude-sessions.app.connectors.jira";

const AUTH_SESSION_TTL_MS = 10 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

type RuntimeAuthSession = ConnectorAuthSession & {
  state: string;
  codeVerifier: string;
  timeout: ReturnType<typeof setTimeout> | null;
};

type SlackTokenSecret = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  tokenType: string | null;
  teamId: string | null;
  teamName: string | null;
  userId: string | null;
};

type SlackTokenEnvelope = {
  secret: SlackTokenSecret;
  scopes: string[];
};

type JiraTokenSecret = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  tokenType: string | null;
  cloudId: string | null;
  cloudName: string | null;
  cloudUrl: string | null;
  userAccountId: string | null;
};

type JiraTokenEnvelope = {
  secret: JiraTokenSecret;
  scopes: string[];
};

type JiraAccessResource = {
  id: string;
  name: string | null;
  url: string | null;
  scopes: string[];
};

type JiraTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  tokenType: string | null;
  scopes: string[];
};

export type JiraAuthContext = {
  accessToken: string;
  cloudId: string;
};

type FetchLike = typeof fetch;
type ConnectorsStoreLike = Pick<
  ConnectorsStore,
  | "close"
  | "listWorkspaceConnectors"
  | "getWorkspaceConnectorRecord"
  | "upsertWorkspaceConnector"
  | "deleteWorkspaceConnector"
>;
type KeychainStoreLike = Pick<
  KeychainStore,
  "setSecret" | "getSecret" | "deleteSecret"
>;
type OAuthServerLike = {
  start: () => Promise<void>;
  stop: () => void;
  status: ConnectorOAuthServerStatus;
};

export class ConnectorsRepository {
  #store: ConnectorsStoreLike;
  #keychain: KeychainStoreLike;
  #oauthServer: OAuthServerLike;
  #fetch: FetchLike;
  #authSessionTtlMs: number;
  #slackClientId: string;
  #slackClientSecret: string;
  #jiraClientId: string;
  #jiraClientSecret: string;
  #authById = new Map<string, RuntimeAuthSession>();
  #authByState = new Map<string, string>();
  #started = false;

  constructor(opts?: {
    store?: ConnectorsStoreLike;
    keychain?: KeychainStoreLike;
    oauthServer?: OAuthServerLike;
    fetchImpl?: FetchLike;
    authSessionTtlMs?: number;
    slackClientId?: string;
    slackClientSecret?: string;
    jiraClientId?: string;
    jiraClientSecret?: string;
  }) {
    this.#store = opts?.store ?? new ConnectorsStore();
    this.#keychain = opts?.keychain ?? new KeychainStore();
    this.#fetch = opts?.fetchImpl ?? fetch;
    this.#authSessionTtlMs = Math.max(1, opts?.authSessionTtlMs ?? AUTH_SESSION_TTL_MS);
    this.#slackClientId = String(opts?.slackClientId ?? SLACK_CLIENT_ID).trim();
    this.#slackClientSecret = String(
      opts?.slackClientSecret ?? SLACK_CLIENT_SECRET
    ).trim();
    this.#jiraClientId = String(opts?.jiraClientId ?? JIRA_CLIENT_ID).trim();
    this.#jiraClientSecret = String(opts?.jiraClientSecret ?? JIRA_CLIENT_SECRET).trim();
    this.#oauthServer = opts?.oauthServer
      ?? new ConnectorOAuthServer((payload) => this.handleOAuthCallback(payload));
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#oauthServer.start();
  }

  close(): void {
    for (const auth of this.#authById.values()) {
      if (auth.timeout) clearTimeout(auth.timeout);
    }
    this.#authById.clear();
    this.#authByState.clear();
    this.#oauthServer.stop();
    this.#store.close();
  }

  async listWorkspaceConnectors(workspacePath: string): Promise<WorkspaceConnector[]> {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
    const records = this.#store.listWorkspaceConnectors(normalizedWorkspacePath);

    const byProvider = new Map<ConnectorProvider, WorkspaceConnector>();
    for (const record of records) {
      byProvider.set(record.provider, record);
    }

    return CONNECTOR_PROVIDERS.map((provider) =>
      byProvider.get(provider) ?? buildDefaultConnector(normalizedWorkspacePath, provider)
    );
  }

  async startConnectorAuth(
    workspacePath: string,
    provider: ConnectorProvider
  ): Promise<ConnectorAuthSession> {
    if (!isConnectorProvider(provider)) {
      throw new Error(`Unsupported connector provider: ${provider}`);
    }

    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
    await this.start();

    const providerLabel = connectorProviderLabel(provider);
    const configError = this.#getProviderConfigError(provider);
    if (configError) {
      return this.#createFailedAuthSession(
        normalizedWorkspacePath,
        provider,
        configError
      );
    }

    const status = this.#oauthServer.status;
    if (!status.ready) {
      return this.#createFailedAuthSession(
        normalizedWorkspacePath,
        provider,
        status.message ?? `${providerLabel} OAuth callback server is not ready.`
      );
    }

    if (!status.trusted) {
      return this.#createFailedAuthSession(
        normalizedWorkspacePath,
        provider,
        status.message
          ?? "Local HTTPS certificate is not trusted. Retry after trusting the certificate."
      );
    }

    this.#expirePendingAuthSessions(normalizedWorkspacePath, provider);

    const authId = crypto.randomUUID();
    const state = randomBase64Url(18);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = base64Url(sha256(codeVerifier));
    const expiresAt = new Date(Date.now() + this.#authSessionTtlMs).toISOString();
    const authorizeUrl = this.#buildAuthorizeUrl(provider, {
      state,
      codeChallenge,
    });

    const auth: RuntimeAuthSession = {
      id: authId,
      workspacePath: normalizedWorkspacePath,
      provider,
      status: "pending",
      authorizeUrl,
      error: null,
      expiresAt,
      updatedAt: isoNow(),
      state,
      codeVerifier,
      timeout: null,
    };

    auth.timeout = setTimeout(() => {
      this.#markAuthSessionExpired(auth.id);
    }, this.#authSessionTtlMs);

    this.#authById.set(auth.id, auth);
    this.#authByState.set(auth.state, auth.id);
    return toPublicAuthSession(auth);
  }

  async getConnectorAuthStatus(authSessionId: string): Promise<ConnectorAuthSession> {
    const session = this.#authById.get(authSessionId);
    if (!session) {
      throw new Error("Auth session not found");
    }

    if (session.status === "pending" && Date.parse(session.expiresAt) <= Date.now()) {
      this.#markAuthSessionExpired(session.id);
    }

    const refreshed = this.#authById.get(authSessionId);
    if (!refreshed) {
      throw new Error("Auth session not found");
    }
    return toPublicAuthSession(refreshed);
  }

  async disconnectWorkspaceConnector(
    workspacePath: string,
    provider: ConnectorProvider
  ): Promise<void> {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
    const record = this.#store.getWorkspaceConnectorRecord(
      normalizedWorkspacePath,
      provider
    );
    if (record?.keychainAccount) {
      await this.#keychain.deleteSecret(
        keychainServiceForProvider(provider),
        record.keychainAccount
      );
    }
    this.#store.deleteWorkspaceConnector(normalizedWorkspacePath, provider);
  }

  async getSlackAccessToken(workspacePath: string): Promise<string> {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
    const record = this.#store.getWorkspaceConnectorRecord(
      normalizedWorkspacePath,
      SLACK_PROVIDER
    );
    if (!record || record.status !== "connected") {
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    const keychainAccount = record.keychainAccount
      ?? buildKeychainAccount(normalizedWorkspacePath);
    const secretRaw = await this.#keychain.getSecret(SLACK_KEYCHAIN_SERVICE, keychainAccount);
    if (!secretRaw) {
      await this.#setConnectorError(record, "Slack token not found. Reconnect Slack.");
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    const parsed = parseSlackTokenSecret(secretRaw);
    if (!parsed) {
      await this.#setConnectorError(record, "Stored Slack token is invalid. Reconnect Slack.");
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    const maybeRefreshed = await this.#refreshSlackTokenIfNeeded(
      normalizedWorkspacePath,
      record,
      keychainAccount,
      parsed
    );

    if (!maybeRefreshed.accessToken) {
      await this.#setConnectorError(record, "Slack access token is unavailable. Reconnect Slack.");
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    return maybeRefreshed.accessToken;
  }

  async getJiraAuthContext(workspacePath: string): Promise<JiraAuthContext> {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
    const record = this.#store.getWorkspaceConnectorRecord(
      normalizedWorkspacePath,
      JIRA_PROVIDER
    );
    if (!record || record.status !== "connected") {
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    const keychainAccount = record.keychainAccount
      ?? buildKeychainAccount(normalizedWorkspacePath);
    const secretRaw = await this.#keychain.getSecret(JIRA_KEYCHAIN_SERVICE, keychainAccount);
    if (!secretRaw) {
      await this.#setConnectorError(record, "Jira token not found. Reconnect Jira.");
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    const parsed = parseJiraTokenSecret(secretRaw);
    if (!parsed) {
      await this.#setConnectorError(record, "Stored Jira token is invalid. Reconnect Jira.");
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    const maybeRefreshed = await this.#refreshJiraTokenIfNeeded(
      normalizedWorkspacePath,
      record,
      keychainAccount,
      parsed
    );

    if (!maybeRefreshed.accessToken) {
      await this.#setConnectorError(record, "Jira access token is unavailable. Reconnect Jira.");
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    const cloudId = normalizeNullableString(maybeRefreshed.cloudId)
      ?? normalizeNullableString(record.externalWorkspaceId);
    if (!cloudId) {
      await this.#setConnectorError(record, "Jira cloud id is missing. Reconnect Jira.");
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    return {
      accessToken: maybeRefreshed.accessToken,
      cloudId,
    };
  }

  async getJiraAccessToken(workspacePath: string): Promise<string> {
    const auth = await this.getJiraAuthContext(workspacePath);
    return auth.accessToken;
  }

  async handleOAuthCallback(payload: OAuthCallbackPayload): Promise<OAuthCallbackResult> {
    const state = payload.state ?? "";
    const authId = this.#authByState.get(state);
    if (!authId) {
      return {
        ok: false,
        title: "Connector authorization failed",
        message: "Invalid or expired OAuth state. Please retry from Connectors.",
      };
    }

    const auth = this.#authById.get(authId);
    if (!auth) {
      return {
        ok: false,
        title: "Connector authorization failed",
        message: "Auth session expired. Please retry from Connectors.",
      };
    }

    const providerLabel = connectorProviderLabel(auth.provider);
    this.#authByState.delete(state);

    if (auth.status !== "pending") {
      return {
        ok: false,
        title: `${providerLabel} authorization failed`,
        message: "This authorization session is no longer active.",
      };
    }

    if (Date.parse(auth.expiresAt) <= Date.now()) {
      this.#settleAuthSession(auth.id, "expired", "OAuth session expired. Retry from Connectors.");
      return {
        ok: false,
        title: `${providerLabel} authorization expired`,
        message: `The OAuth session expired. Return to Claudex and reconnect ${providerLabel}.`,
      };
    }

    if (payload.error) {
      const message = payload.errorDescription
        ? `${payload.error}: ${payload.errorDescription}`
        : payload.error;
      this.#settleAuthSession(auth.id, "failed", message);
      return {
        ok: false,
        title: `${providerLabel} authorization was canceled`,
        message: `Return to Claudex and retry ${providerLabel} Connect.`,
      };
    }

    if (!payload.code) {
      this.#settleAuthSession(auth.id, "failed", "Missing authorization code.");
      return {
        ok: false,
        title: `${providerLabel} authorization failed`,
        message: "No authorization code received. Please retry from Connectors.",
      };
    }

    try {
      if (auth.provider === SLACK_PROVIDER) {
        const envelope = await this.#exchangeSlackAuthorizationCode(
          payload.code,
          auth.codeVerifier
        );
        await this.#persistSlackConnection(auth, envelope);
      } else if (auth.provider === JIRA_PROVIDER) {
        const envelope = await this.#exchangeJiraAuthorizationCode(
          payload.code,
          auth.codeVerifier
        );
        await this.#persistJiraConnection(auth, envelope);
      } else {
        throw new Error(`Unsupported connector provider: ${auth.provider}`);
      }

      this.#settleAuthSession(auth.id, "completed", null);
      return {
        ok: true,
        title: `${providerLabel} connected`,
        message: `${providerLabel} connected successfully. You can return to Claudex.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#settleAuthSession(auth.id, "failed", message);
      return {
        ok: false,
        title: `${providerLabel} authorization failed`,
        message: message || `Failed to persist ${providerLabel} connector credentials.`,
      };
    }
  }

  async #persistSlackConnection(
    auth: RuntimeAuthSession,
    envelope: SlackTokenEnvelope
  ): Promise<void> {
    const keychainAccount = buildKeychainAccount(auth.workspacePath);
    await this.#keychain.setSecret(
      SLACK_KEYCHAIN_SERVICE,
      keychainAccount,
      JSON.stringify(envelope.secret)
    );

    this.#store.upsertWorkspaceConnector({
      workspacePath: auth.workspacePath,
      provider: SLACK_PROVIDER,
      status: "connected",
      externalWorkspaceId: envelope.secret.teamId,
      externalWorkspaceName: envelope.secret.teamName,
      externalUserId: envelope.secret.userId,
      scopes: envelope.scopes,
      tokenExpiresAt: envelope.secret.expiresAt,
      lastError: null,
      keychainAccount,
    });
  }

  async #persistJiraConnection(
    auth: RuntimeAuthSession,
    envelope: JiraTokenEnvelope
  ): Promise<void> {
    const keychainAccount = buildKeychainAccount(auth.workspacePath);
    await this.#keychain.setSecret(
      JIRA_KEYCHAIN_SERVICE,
      keychainAccount,
      JSON.stringify(envelope.secret)
    );

    this.#store.upsertWorkspaceConnector({
      workspacePath: auth.workspacePath,
      provider: JIRA_PROVIDER,
      status: "connected",
      externalWorkspaceId: envelope.secret.cloudId,
      externalWorkspaceName: envelope.secret.cloudName,
      externalUserId: envelope.secret.userAccountId,
      scopes: envelope.scopes,
      tokenExpiresAt: envelope.secret.expiresAt,
      lastError: null,
      keychainAccount,
    });
  }

  async #refreshSlackTokenIfNeeded(
    workspacePath: string,
    record: WorkspaceConnectorRecord,
    keychainAccount: string,
    secret: SlackTokenSecret
  ): Promise<SlackTokenSecret> {
    const expiresAt = secret.expiresAt ? Date.parse(secret.expiresAt) : NaN;
    const isExpiring = Number.isFinite(expiresAt)
      && (Date.now() + TOKEN_REFRESH_SKEW_MS) >= expiresAt;
    if (!isExpiring) {
      return secret;
    }

    if (!secret.refreshToken) {
      await this.#setConnectorError(
        record,
        "Slack token expired and cannot be refreshed. Reconnect Slack."
      );
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    let envelope: SlackTokenEnvelope;
    try {
      envelope = await this.#exchangeSlackRefreshToken(secret.refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.#setConnectorError(
        record,
        message || "Slack token refresh failed. Reconnect Slack."
      );
      throw new Error("Connect Slack in Connectors to fetch this source");
    }

    const nextSecret: SlackTokenSecret = {
      ...secret,
      ...envelope.secret,
      teamId: envelope.secret.teamId ?? secret.teamId,
      teamName: envelope.secret.teamName ?? secret.teamName,
      userId: envelope.secret.userId ?? secret.userId,
    };

    await this.#keychain.setSecret(
      SLACK_KEYCHAIN_SERVICE,
      keychainAccount,
      JSON.stringify(nextSecret)
    );
    this.#store.upsertWorkspaceConnector({
      workspacePath,
      provider: SLACK_PROVIDER,
      status: "connected",
      externalWorkspaceId: nextSecret.teamId,
      externalWorkspaceName: nextSecret.teamName,
      externalUserId: nextSecret.userId,
      scopes: envelope.scopes.length > 0
        ? envelope.scopes
        : splitScopes(nextSecret.scope),
      tokenExpiresAt: nextSecret.expiresAt,
      lastError: null,
      keychainAccount,
    });

    return nextSecret;
  }

  async #refreshJiraTokenIfNeeded(
    workspacePath: string,
    record: WorkspaceConnectorRecord,
    keychainAccount: string,
    secret: JiraTokenSecret
  ): Promise<JiraTokenSecret> {
    const expiresAt = secret.expiresAt ? Date.parse(secret.expiresAt) : NaN;
    const isExpiring = Number.isFinite(expiresAt)
      && (Date.now() + TOKEN_REFRESH_SKEW_MS) >= expiresAt;
    if (!isExpiring) {
      return secret;
    }

    if (!secret.refreshToken) {
      await this.#setConnectorError(
        record,
        "Jira token expired and cannot be refreshed. Reconnect Jira."
      );
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    let envelope: JiraTokenEnvelope;
    try {
      envelope = await this.#exchangeJiraRefreshToken(secret.refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.#setConnectorError(
        record,
        message || "Jira token refresh failed. Reconnect Jira."
      );
      throw new Error("Connect Jira in Connectors to fetch this source");
    }

    const nextSecret: JiraTokenSecret = {
      ...secret,
      ...envelope.secret,
      cloudId: envelope.secret.cloudId ?? secret.cloudId,
      cloudName: envelope.secret.cloudName ?? secret.cloudName,
      cloudUrl: envelope.secret.cloudUrl ?? secret.cloudUrl,
      userAccountId: envelope.secret.userAccountId ?? secret.userAccountId,
    };

    await this.#keychain.setSecret(
      JIRA_KEYCHAIN_SERVICE,
      keychainAccount,
      JSON.stringify(nextSecret)
    );
    this.#store.upsertWorkspaceConnector({
      workspacePath,
      provider: JIRA_PROVIDER,
      status: "connected",
      externalWorkspaceId: nextSecret.cloudId,
      externalWorkspaceName: nextSecret.cloudName,
      externalUserId: nextSecret.userAccountId,
      scopes: envelope.scopes.length > 0
        ? envelope.scopes
        : splitScopes(nextSecret.scope),
      tokenExpiresAt: nextSecret.expiresAt,
      lastError: null,
      keychainAccount,
    });

    return nextSecret;
  }

  async #exchangeSlackAuthorizationCode(
    code: string,
    codeVerifier: string
  ): Promise<SlackTokenEnvelope> {
    const params = new URLSearchParams();
    params.set("grant_type", "authorization_code");
    params.set("client_id", this.#slackClientId);
    params.set("client_secret", this.#slackClientSecret);
    params.set("code", code);
    params.set("redirect_uri", SLACK_REDIRECT_URI);
    params.set("code_verifier", codeVerifier);
    return this.#exchangeSlackToken(params);
  }

  async #exchangeSlackRefreshToken(refreshToken: string): Promise<SlackTokenEnvelope> {
    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("client_id", this.#slackClientId);
    params.set("client_secret", this.#slackClientSecret);
    params.set("refresh_token", refreshToken);
    return this.#exchangeSlackToken(params);
  }

  async #exchangeSlackToken(params: URLSearchParams): Promise<SlackTokenEnvelope> {
    const response = await this.#fetch(SLACK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const code = isRecord(payload) ? normalizeNullableString(payload.error) : null;
      if (code) {
        throw new Error(`Slack OAuth error: ${code}`);
      }
      throw new Error(`Slack token exchange failed (${response.status}).`);
    }

    return parseSlackTokenEnvelope(payload);
  }

  async #exchangeJiraAuthorizationCode(
    code: string,
    codeVerifier: string
  ): Promise<JiraTokenEnvelope> {
    const token = await this.#exchangeJiraToken({
      grant_type: "authorization_code",
      client_id: this.#jiraClientId,
      client_secret: this.#jiraClientSecret,
      code,
      redirect_uri: JIRA_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const resource = await this.#fetchJiraAccessibleResource(token.accessToken);

    return {
      secret: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scope: token.scope,
        tokenType: token.tokenType,
        cloudId: resource.id,
        cloudName: resource.name,
        cloudUrl: resource.url,
        userAccountId: null,
      },
      scopes: normalizeScopes([...token.scopes, ...resource.scopes]),
    };
  }

  async #exchangeJiraRefreshToken(refreshToken: string): Promise<JiraTokenEnvelope> {
    const token = await this.#exchangeJiraToken({
      grant_type: "refresh_token",
      client_id: this.#jiraClientId,
      client_secret: this.#jiraClientSecret,
      refresh_token: refreshToken,
    });

    return {
      secret: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scope: token.scope,
        tokenType: token.tokenType,
        cloudId: null,
        cloudName: null,
        cloudUrl: null,
        userAccountId: null,
      },
      scopes: token.scopes,
    };
  }

  async #exchangeJiraToken(body: Record<string, unknown>): Promise<JiraTokenPayload> {
    const response = await this.#fetch(JIRA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(parseJiraTokenError(payload, response.status));
    }

    return parseJiraTokenPayload(payload);
  }

  async #fetchJiraAccessibleResource(accessToken: string): Promise<JiraAccessResource> {
    const response = await this.#fetch(JIRA_ACCESSIBLE_RESOURCES_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = parseJiraTokenError(payload, response.status);
      throw new Error(`Jira accessible resources failed: ${message}`);
    }

    const resources = parseJiraAccessResources(payload);
    if (resources.length === 0) {
      throw new Error("Jira OAuth succeeded but no accessible resources were returned.");
    }

    return resources.find((entry) => entry.scopes.includes("read:jira-work"))
      ?? resources[0];
  }

  async #setConnectorError(record: WorkspaceConnectorRecord, message: string): Promise<void> {
    this.#store.upsertWorkspaceConnector({
      workspacePath: record.workspacePath,
      provider: record.provider,
      status: "error",
      externalWorkspaceId: record.externalWorkspaceId,
      externalWorkspaceName: record.externalWorkspaceName,
      externalUserId: record.externalUserId,
      scopes: record.scopes,
      tokenExpiresAt: record.tokenExpiresAt,
      lastError: message,
      keychainAccount: record.keychainAccount,
    });
  }

  #createFailedAuthSession(
    workspacePath: string,
    provider: ConnectorProvider,
    message: string
  ): ConnectorAuthSession {
    const auth: RuntimeAuthSession = {
      id: crypto.randomUUID(),
      workspacePath,
      provider,
      status: "failed",
      authorizeUrl: null,
      error: message,
      expiresAt: new Date(Date.now() + this.#authSessionTtlMs).toISOString(),
      updatedAt: isoNow(),
      state: "",
      codeVerifier: "",
      timeout: null,
    };
    this.#authById.set(auth.id, auth);
    return toPublicAuthSession(auth);
  }

  #expirePendingAuthSessions(workspacePath: string, provider: ConnectorProvider): void {
    for (const auth of this.#authById.values()) {
      if (auth.workspacePath !== workspacePath) continue;
      if (auth.provider !== provider) continue;
      if (auth.status !== "pending") continue;
      this.#settleAuthSession(auth.id, "expired", "Superseded by a new authorization request.");
    }
  }

  #markAuthSessionExpired(authId: string): void {
    this.#settleAuthSession(authId, "expired", "Authorization session expired.");
  }

  #settleAuthSession(
    authId: string,
    status: Exclude<ConnectorAuthSessionStatus, "pending">,
    error: string | null
  ): void {
    const auth = this.#authById.get(authId);
    if (!auth) return;
    if (auth.timeout) {
      clearTimeout(auth.timeout);
      auth.timeout = null;
    }
    this.#authByState.delete(auth.state);
    this.#authById.set(authId, {
      ...auth,
      status,
      error,
      updatedAt: isoNow(),
    });
  }

  #buildAuthorizeUrl(
    provider: ConnectorProvider,
    params: {
      state: string;
      codeChallenge: string;
    }
  ): string {
    if (provider === SLACK_PROVIDER) {
      return buildSlackAuthorizeUrl({
        clientId: this.#slackClientId,
        redirectUri: SLACK_REDIRECT_URI,
        state: params.state,
        codeChallenge: params.codeChallenge,
        userScopes: SLACK_USER_SCOPES,
      });
    }

    if (provider === JIRA_PROVIDER) {
      return buildJiraAuthorizeUrl({
        clientId: this.#jiraClientId,
        redirectUri: JIRA_REDIRECT_URI,
        state: params.state,
        codeChallenge: params.codeChallenge,
        scopes: JIRA_SCOPES,
      });
    }

    throw new Error(`Unsupported connector provider: ${provider}`);
  }

  #getProviderConfigError(provider: ConnectorProvider): string | null {
    if (provider === SLACK_PROVIDER) {
      if (!this.#slackClientId) {
        return "Slack OAuth is not configured yet. Set a valid Slack client id.";
      }
      if (!this.#slackClientSecret) {
        return "Slack OAuth is not configured yet. Set CLAUDEX_SLACK_CLIENT_SECRET.";
      }
      return null;
    }

    if (provider === JIRA_PROVIDER) {
      if (!this.#jiraClientId) {
        return "Jira OAuth is not configured yet. Set CLAUDEX_JIRA_CLIENT_ID.";
      }
      if (!this.#jiraClientSecret) {
        return "Jira OAuth is not configured yet. Set CLAUDEX_JIRA_CLIENT_SECRET.";
      }
      return null;
    }

    return `Unsupported connector provider: ${provider}`;
  }
}

function parseSlackTokenEnvelope(input: unknown): SlackTokenEnvelope {
  const payload = isRecord(input) ? input : {};
  if (!Boolean(payload.ok)) {
    const errCode = normalizeNullableString(payload.error) ?? "unknown_error";
    throw new Error(`Slack OAuth error: ${errCode}`);
  }

  const authedUser = isRecord(payload.authed_user) ? payload.authed_user : {};
  const accessToken = normalizeNullableString(authedUser.access_token)
    ?? normalizeNullableString(payload.access_token);
  if (!accessToken) {
    throw new Error("Slack OAuth did not return an access token.");
  }

  const refreshToken = normalizeNullableString(authedUser.refresh_token)
    ?? normalizeNullableString(payload.refresh_token);
  const expiresIn = asFiniteNumber(authedUser.expires_in)
    ?? asFiniteNumber(payload.expires_in);
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + Math.max(0, expiresIn) * 1000).toISOString()
    : null;
  const scope = normalizeNullableString(authedUser.scope)
    ?? normalizeNullableString(payload.scope);
  const tokenType = normalizeNullableString(authedUser.token_type)
    ?? normalizeNullableString(payload.token_type);
  const team = isRecord(payload.team) ? payload.team : {};
  const teamId = normalizeNullableString(team.id);
  const teamName = normalizeNullableString(team.name);
  const userId = normalizeNullableString(authedUser.id)
    ?? normalizeNullableString(authedUser.user_id);

  const secret: SlackTokenSecret = {
    accessToken,
    refreshToken,
    expiresAt,
    scope,
    tokenType,
    teamId,
    teamName,
    userId,
  };

  return {
    secret,
    scopes: splitScopes(scope),
  };
}

function parseJiraTokenPayload(input: unknown): JiraTokenPayload {
  if (!isRecord(input)) {
    throw new Error("Jira OAuth returned an invalid token payload.");
  }

  const error = normalizeNullableString(input.error);
  if (error) {
    const errorDescription = normalizeNullableString(input.error_description);
    const fullError = errorDescription ? `${error}: ${errorDescription}` : error;
    throw new Error(`Jira OAuth error: ${fullError}`);
  }

  const accessToken = normalizeNullableString(input.access_token);
  if (!accessToken) {
    throw new Error("Jira OAuth did not return an access token.");
  }

  const refreshToken = normalizeNullableString(input.refresh_token);
  const expiresIn = asFiniteNumber(input.expires_in);
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + Math.max(0, expiresIn) * 1000).toISOString()
    : null;
  const scope = normalizeNullableString(input.scope);
  const tokenType = normalizeNullableString(input.token_type);

  return {
    accessToken,
    refreshToken,
    expiresAt,
    scope,
    tokenType,
    scopes: splitScopes(scope),
  };
}

function parseJiraTokenSecret(raw: string): JiraTokenSecret | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const accessToken = normalizeNullableString(parsed.accessToken);
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: normalizeNullableString(parsed.refreshToken),
    expiresAt: normalizeNullableString(parsed.expiresAt),
    scope: normalizeNullableString(parsed.scope),
    tokenType: normalizeNullableString(parsed.tokenType),
    cloudId: normalizeNullableString(parsed.cloudId),
    cloudName: normalizeNullableString(parsed.cloudName),
    cloudUrl: normalizeNullableString(parsed.cloudUrl),
    userAccountId: normalizeNullableString(parsed.userAccountId),
  };
}

function parseSlackTokenSecret(raw: string): SlackTokenSecret | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const accessToken = normalizeNullableString(parsed.accessToken);
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: normalizeNullableString(parsed.refreshToken),
    expiresAt: normalizeNullableString(parsed.expiresAt),
    scope: normalizeNullableString(parsed.scope),
    tokenType: normalizeNullableString(parsed.tokenType),
    teamId: normalizeNullableString(parsed.teamId),
    teamName: normalizeNullableString(parsed.teamName),
    userId: normalizeNullableString(parsed.userId),
  };
}

function parseJiraTokenError(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const error = normalizeNullableString(payload.error);
    const errorDescription = normalizeNullableString(payload.error_description);
    if (error) {
      const fullError = errorDescription ? `${error}: ${errorDescription}` : error;
      return `Jira OAuth error: ${fullError}`;
    }
  }
  return `Jira token exchange failed (${status}).`;
}

function parseJiraAccessResources(input: unknown): JiraAccessResource[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const resources: JiraAccessResource[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const id = normalizeNullableString(entry.id);
    if (!id) continue;
    const name = normalizeNullableString(entry.name);
    const url = normalizeNullableString(entry.url);
    const scopes = Array.isArray(entry.scopes)
      ? normalizeScopes(entry.scopes.map((scope) => String(scope ?? "")))
      : [];
    resources.push({ id, name, url, scopes });
  }

  return resources;
}

function buildDefaultConnector(
  workspacePath: string,
  provider: ConnectorProvider
): WorkspaceConnector {
  return {
    workspacePath,
    provider,
    status: "disconnected",
    externalWorkspaceId: null,
    externalWorkspaceName: null,
    externalUserId: null,
    scopes: [],
    tokenExpiresAt: null,
    lastError: null,
    updatedAt: isoNow(),
  };
}

function buildSlackAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  userScopes: string[];
}): string {
  const query = new URLSearchParams();
  query.set("client_id", params.clientId);
  query.set("redirect_uri", params.redirectUri);
  query.set("state", params.state);
  query.set("user_scope", params.userScopes.join(","));
  query.set("code_challenge", params.codeChallenge);
  query.set("code_challenge_method", "S256");
  return `${SLACK_AUTHORIZE_URL}?${query.toString()}`;
}

function buildJiraAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
}): string {
  const query = new URLSearchParams();
  query.set("audience", "api.atlassian.com");
  query.set("client_id", params.clientId);
  query.set("scope", params.scopes.join(" "));
  query.set("redirect_uri", params.redirectUri);
  query.set("state", params.state);
  query.set("response_type", "code");
  query.set("prompt", "consent");
  query.set("code_challenge", params.codeChallenge);
  query.set("code_challenge_method", "S256");
  return `${JIRA_AUTHORIZE_URL}?${query.toString()}`;
}

function keychainServiceForProvider(provider: ConnectorProvider): string {
  if (provider === SLACK_PROVIDER) return SLACK_KEYCHAIN_SERVICE;
  if (provider === JIRA_PROVIDER) return JIRA_KEYCHAIN_SERVICE;
  return SLACK_KEYCHAIN_SERVICE;
}

function connectorProviderLabel(provider: ConnectorProvider): string {
  if (provider === SLACK_PROVIDER) return "Slack";
  if (provider === JIRA_PROVIDER) return "Jira";
  return provider;
}

function isConnectorProvider(value: string): value is ConnectorProvider {
  return CONNECTOR_PROVIDERS.includes(value as ConnectorProvider);
}

function buildKeychainAccount(workspacePath: string): string {
  const digest = createHash("sha256").update(workspacePath).digest("hex");
  return `workspace:${digest}`;
}

function normalizeWorkspacePath(workspacePath: string): string {
  const normalized = String(workspacePath ?? "").trim();
  if (!normalized) {
    throw new Error("workspacePath is required");
  }
  return normalized;
}

function normalizeScopes(scopes: string[]): string[] {
  const out = new Set<string>();
  for (const scope of scopes) {
    const normalized = String(scope ?? "").trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function splitScopes(scope: string | null): string[] {
  if (!scope) return [];
  return normalizeScopes(scope.split(/[\s,]+/g));
}

function toPublicAuthSession(session: RuntimeAuthSession): ConnectorAuthSession {
  return {
    id: session.id,
    workspacePath: session.workspacePath,
    provider: session.provider,
    status: session.status,
    authorizeUrl: session.authorizeUrl,
    error: session.error,
    expiresAt: session.expiresAt,
    updatedAt: session.updatedAt,
  };
}

function randomBase64Url(size: number): string {
  return base64Url(randomBytes(size));
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
