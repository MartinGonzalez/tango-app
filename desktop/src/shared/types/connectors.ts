export type ConnectorProvider = "slack" | "jira";

export type ConnectorStatus = "connected" | "disconnected" | "error";

export type StageConnector = {
  stagePath: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  externalStageId: string | null;
  externalStageName: string | null;
  externalUserId: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type ConnectorAuthSessionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "expired";

export type ConnectorAuthSession = {
  id: string;
  stagePath: string;
  provider: ConnectorProvider;
  status: ConnectorAuthSessionStatus;
  authorizeUrl: string | null;
  error: string | null;
  expiresAt: string;
  updatedAt: string;
};

export type ConnectorCredential = {
  provider: ConnectorProvider;
  accessToken: string;
  expiresAt: string | null;
  scopes: string[];
  metadata?: Record<string, string | null>;
};
