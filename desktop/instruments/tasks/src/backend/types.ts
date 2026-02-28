export type TaskCardStatus =
  | "todo"
  | "in_progress"
  | "draft"
  | "planned"
  | "running"
  | "done"
  | "blocked"
  | "blocked_by"
  | "archived";

export type TaskAction = "improve" | "plan" | "execute";

export type TaskSourceKind = "jira" | "slack" | "url" | "manual";

export type TaskRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type TaskCardSummary = {
  id: string;
  stagePath: string;
  title: string;
  status: TaskCardStatus;
  updatedAt: string;
  hasPlan: boolean;
};

export type TaskSourceFetchStatus = "idle" | "success" | "http_error" | "network_error";

export type TaskSource = {
  id: string;
  taskId: string;
  kind: TaskSourceKind;
  url: string | null;
  title: string | null;
  content: string | null;
  fetchStatus: TaskSourceFetchStatus;
  httpStatus: number | null;
  error: string | null;
  fetchedAt: string | null;
  updatedAt: string;
};

export type TaskRun = {
  id: string;
  taskId: string;
  action: TaskAction;
  status: TaskRunStatus;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  output: string | null;
  error: string | null;
};

export type TaskCardDetail = {
  id: string;
  stagePath: string;
  title: string;
  notes: string;
  planMarkdown: string | null;
  status: TaskCardStatus;
  sources: TaskSource[];
  lastRun: TaskRun | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorProvider = "slack" | "jira";

export type StageConnector = {
  stagePath: string;
  provider: ConnectorProvider;
  status: "connected" | "disconnected" | "error";
  externalStageId: string | null;
  externalStageName: string | null;
  externalUserId: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type ConnectorAuthSession = {
  id: string;
  stagePath: string;
  provider: ConnectorProvider;
  status: "pending" | "completed" | "failed" | "expired";
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

export type StorageAPI = {
  sqlQuery: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    db?: string
  ) => Promise<T[]>;
  sqlExecute: (
    sql: string,
    params?: unknown[],
    db?: string
  ) => Promise<{ changes: number; lastInsertRowid: number | null }>;
};

export type BackendConnectorsAPI = {
  listStageConnectors: (stagePath: string) => Promise<StageConnector[]>;
  connect: (stagePath: string, provider: ConnectorProvider) => Promise<ConnectorAuthSession>;
  disconnect: (stagePath: string, provider: ConnectorProvider) => Promise<void>;
  getCredential: (
    stagePath: string,
    provider: ConnectorProvider
  ) => Promise<ConnectorCredential>;
};
