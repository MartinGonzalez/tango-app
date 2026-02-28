import type {
  ConnectorAuthSession,
  ConnectorCredential,
  ConnectorProvider,
  StageConnector,
} from "./connectors.ts";
import type { SessionInfo } from "./sessions.ts";
import type { Snapshot } from "./snapshot.ts";
import type { ClaudeStreamEvent } from "./stream.ts";
import type { ToolApprovalRequest } from "./tools.ts";
import type { PullRequestAgentReviewStatus } from "./pull-requests.ts";
import type { InstrumentEvent, InstrumentPermission } from "./instruments.ts";

export type InstrumentPanelSlot = "sidebar" | "first" | "second" | "right";

export type PanelAPI = {
  mount: (slot: InstrumentPanelSlot, node: HTMLElement) => void;
  unmount: (slot: InstrumentPanelSlot) => void;
  setVisible: (slot: InstrumentPanelSlot, visible: boolean) => void;
};

export type StorageAPI = {
  getProperty: <T = unknown>(key: string) => Promise<T | null>;
  setProperty: (key: string, value: unknown) => Promise<void>;
  deleteProperty: (key: string) => Promise<void>;
  readFile: (path: string, encoding?: "utf8" | "base64") => Promise<string>;
  writeFile: (path: string, content: string, encoding?: "utf8" | "base64") => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  listFiles: (dir?: string) => Promise<string[]>;
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

export type SessionsAPI = {
  start: (params: {
    prompt: string;
    cwd: string;
    fullAccess?: boolean;
    sessionId?: string;
    selectedFiles?: string[];
    model?: string;
    tools?: string[];
  }) => Promise<{ sessionId: string }>;
  /**
   * @deprecated Use sessions.start().
   */
  spawn: (params: {
    prompt: string;
    cwd: string;
    fullAccess?: boolean;
    sessionId?: string;
    selectedFiles?: string[];
    model?: string;
    tools?: string[];
  }) => Promise<{ sessionId: string }>;
  sendFollowUp: (params: {
    sessionId: string;
    text: string;
    fullAccess?: boolean;
    selectedFiles?: string[];
  }) => Promise<void>;
  kill: (sessionId: string) => Promise<void>;
  list: () => Promise<SessionInfo[]>;
  focus: (params: {
    sessionId: string;
    cwd?: string | null;
  }) => Promise<void>;
};

export type ConnectorsAPI = {
  listStageConnectors: (stagePath: string) => Promise<StageConnector[]>;
  isAuthorized: (stagePath: string, provider: ConnectorProvider) => Promise<boolean>;
  connect: (stagePath: string, provider: ConnectorProvider) => Promise<ConnectorAuthSession>;
  disconnect: (stagePath: string, provider: ConnectorProvider) => Promise<void>;
  getCredential: (
    stagePath: string,
    provider: ConnectorProvider
  ) => Promise<ConnectorCredential>;
};

export type StageAPI = {
  list: () => Promise<string[]>;
  active: () => Promise<string | null>;
};

export type HostEventMap = {
  "snapshot.update": Snapshot;
  "session.stream": {
    sessionId: string;
    event: ClaudeStreamEvent;
  };
  "session.idResolved": {
    tempId: string;
    realId: string;
  };
  "session.ended": {
    sessionId: string;
    exitCode: number;
  };
  "tool.approval": ToolApprovalRequest;
  "pullRequest.agentReviewChanged": {
    repo: string;
    number: number;
    runId: string;
    status: PullRequestAgentReviewStatus;
  };
  "instrument.event": {
    instrumentId: string;
    event: string;
    payload?: unknown;
  };
  "stage.added": {
    path: string;
  };
  "stage.removed": {
    path: string;
  };
  "connector.auth.changed": ConnectorAuthSession;
};

export type HostEventsAPI = {
  subscribe<E extends keyof HostEventMap>(
    event: E,
    handler: (payload: HostEventMap[E]) => void | Promise<void>
  ): () => void;
};

export type ShortcutRegistration = {
  key: string;
  description?: string;
  action: () => void | Promise<void>;
};

export type InstrumentContext = {
  instrumentId: string;
  permissions: InstrumentPermission[];
  panels: PanelAPI;
  storage: StorageAPI;
  sessions: SessionsAPI;
  connectors: ConnectorsAPI;
  stages: StageAPI;
  events: HostEventsAPI;
  invoke: <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ) => Promise<T>;
  registerShortcut: (shortcut: ShortcutRegistration) => void;
  emit: (event: Omit<InstrumentEvent, "instrumentId">) => void;
};

export type InstrumentFrontendModule = {
  activate: (ctx: InstrumentContext) => Promise<void> | void;
  deactivate?: () => Promise<void> | void;
};

export type InstrumentBackendContext = {
  instrumentId: string;
  permissions: InstrumentPermission[];
  emit: (event: Omit<InstrumentEvent, "instrumentId">) => void;
  host: {
    storage: StorageAPI;
    sessions: SessionsAPI;
    connectors: ConnectorsAPI;
    stages: StageAPI;
    events: HostEventsAPI;
  };
};

export type InstrumentBackendModule = {
  activate?: (ctx: InstrumentBackendContext) => Promise<void> | void;
  deactivate?: () => Promise<void> | void;
  invoke?: (
    ctx: InstrumentBackendContext,
    method: string,
    params: Record<string, unknown> | undefined
  ) => Promise<unknown> | unknown;
};
