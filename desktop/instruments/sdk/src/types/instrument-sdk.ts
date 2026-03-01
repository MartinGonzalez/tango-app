import type {
  ConnectorAuthSession,
  ConnectorCredential,
  ConnectorProvider,
  StageConnector,
} from "./connectors.ts";
import type { InstrumentEvent, InstrumentPermission, InstrumentSettingField } from "./instruments.ts";
import type { SessionInfo } from "./sessions.ts";
import type { Snapshot } from "./snapshot.ts";
import type { ClaudeStreamEvent } from "./stream.ts";
import type { ToolApprovalRequest } from "./tools.ts";

/** Inlined from pull-requests.ts to avoid pulling the full PR type tree. */
export type PullRequestAgentReviewStatus =
  | "running"
  | "completed"
  | "failed"
  | "stale";

export type TangoPanelSlot = "sidebar" | "first" | "second" | "right";

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

export type SessionStartParams = {
  prompt: string;
  cwd: string;
  fullAccess?: boolean;
  sessionId?: string;
  selectedFiles?: string[];
  model?: string;
  tools?: string[];
};

export type SessionsAPI = {
  start: (params: SessionStartParams) => Promise<{ sessionId: string }>;
  // Deprecated alias kept for one internal release.
  spawn?: (params: SessionStartParams) => Promise<{ sessionId: string }>;
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
  query: (params: {
    prompt: string;
    cwd?: string;
    model?: string;
    tools?: string[];
  }) => Promise<{
    text: string;
    durationMs: number;
    costUsd: number;
  }>;
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

export type InstrumentActionsAPI = {
  call: <TInput = Record<string, unknown>, TOutput = unknown>(
    action: string,
    input?: TInput
  ) => Promise<TOutput>;
};

export type InstrumentSettingsAPI = {
  getSchema: () => Promise<InstrumentSettingField[]>;
  getValues: <T extends Record<string, unknown> = Record<string, unknown>>() => Promise<T>;
  setValue: (key: string, value: unknown) => Promise<Record<string, unknown>>;
};

export type UIAPI = {
  renderMarkdown: (text: string) => string;
};

export type InstrumentFrontendAPI = {
  instrumentId: string;
  permissions: InstrumentPermission[];
  storage: StorageAPI;
  sessions: SessionsAPI;
  connectors: ConnectorsAPI;
  stages: StageAPI;
  events: HostEventsAPI;
  actions: InstrumentActionsAPI;
  settings: InstrumentSettingsAPI;
  ui: UIAPI;
  registerShortcut: (shortcut: ShortcutRegistration) => void;
  emit: (event: Omit<InstrumentEvent, "instrumentId">) => void;
};

export type TangoPanelRenderResult =
  | HTMLElement
  | {
      node: HTMLElement;
      visible?: boolean;
      onUnmount?: () => void | Promise<void>;
    };

export type TangoPanelComponent = (
  props: { api: InstrumentFrontendAPI }
) => TangoPanelRenderResult | null | Promise<TangoPanelRenderResult | null>;

export type TangoInstrumentDefinition = {
  kind: "tango.instrument.v2";
  panels: {
    sidebar?: TangoPanelComponent | null;
    first?: TangoPanelComponent | null;
    second?: TangoPanelComponent | null;
    right?: TangoPanelComponent | null;
  };
  defaults?: {
    visible?: Partial<Record<TangoPanelSlot, boolean>>;
  };
  lifecycle?: {
    onStart?: (api: InstrumentFrontendAPI) => void | Promise<void>;
    onStop?: () => void | Promise<void>;
  };
};

export type ActionSchema =
  | { type: "any" }
  | { type: "null" }
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "array"; items?: ActionSchema }
  | {
      type: "object";
      properties?: Record<string, ActionSchema>;
      required?: string[];
      additionalProperties?: boolean;
    };

export type InstrumentBackendAction<I = unknown, O = unknown> = {
  input?: ActionSchema;
  output?: ActionSchema;
  handler: (ctx: InstrumentBackendContext, input: I) => Promise<O> | O;
};

export type InstrumentBackendHostAPI = {
  storage: StorageAPI;
  sessions: SessionsAPI;
  connectors: ConnectorsAPI;
  stages: StageAPI;
  events: HostEventsAPI;
  settings: InstrumentSettingsAPI;
};

export type InstrumentBackendContext = {
  instrumentId: string;
  permissions: InstrumentPermission[];
  emit: (event: Omit<InstrumentEvent, "instrumentId">) => void;
  host: InstrumentBackendHostAPI;
};

export type InstrumentBackendDefinition = {
  kind: "tango.instrument.backend.v2";
  actions: Record<string, InstrumentBackendAction<any, any>>;
  onStart?: (ctx: InstrumentBackendContext) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
};

export type UseSessionOptions = {
  id: string;
  persist?: boolean;
};

export type UseSessionReturn = {
  send: (text: string) => Promise<void>;
  /** Clear the current session and all persisted state. Next send() starts fresh. */
  reset: () => Promise<void>;
  userMessage: string;
  response: string;
  isResponding: boolean;
  sessionId: string | null;
  loaded: boolean;
};
