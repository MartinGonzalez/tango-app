import Electrobun, { Electroview } from "electrobun/view";
import { Store } from "./lib/state.ts";
import { h, qs, clearChildren } from "./lib/dom.ts";
import {
  connectorsToolIcon,
  pluginToolIcon,
  pullRequestsToolIcon,
  tasksToolIcon,
} from "./lib/icons.ts";
import {
  buildPullRequestFileReviewStateMap,
  countSeenFiles,
} from "./lib/pr-file-review.ts";
import { PanelLayout } from "./components/panel-layout.ts";
import { Sidebar, type StageData } from "./components/sidebar.ts";
import {
  PluginsSidebar,
  type PluginSidebarSelection,
} from "./components/plugins-sidebar.ts";
import {
  TasksSidebar,
  type TaskStageGroup,
} from "./components/tasks-sidebar.ts";
import {
  PRsSidebar,
  type PullRequestRepoGroup,
  type PullRequestSidebarSection,
} from "./components/prs-sidebar.ts";
import { ConnectorsSidebar } from "./components/connectors-sidebar.ts";
import { InstrumentsSidebar } from "./components/instruments-sidebar.ts";
import { PluginsPreview } from "./components/plugins-preview.ts";
import { ConnectorsView } from "./components/connectors-view.ts";
import { ChatView } from "./components/chat-view.ts";
import { DiffView } from "./components/diff-view.ts";
import { FilesPanel, type FileListView } from "./components/files-panel.ts";
import { BranchPanel } from "./components/branch-panel.ts";
import { CommitModal } from "./components/commit-modal.ts";
import { TasksView } from "./components/tasks-view.ts";
import { PRView } from "./components/pr-view.ts";
import type {
  SessionInfo,
  Snapshot,
  ClaudeStreamEvent,
  TranscriptMessage,
  DiffFile,
  DiffScope,
  BranchCommit,
  CommitContext,
  Activity,
  HistorySession,
  ToolApprovalRequest,
  SlashCommandEntry,
  InstalledPlugin,
  TaskAction,
  TaskCardDetail,
  TaskCardSummary,
  TaskCardStatus,
  ConnectorAuthSession,
  ConnectorProvider,
  PullRequestDetail,
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewRun,
  PullRequestReviewThread,
  PullRequestReviewState,
  PullRequestSummary,
  StageConnector,
  InstrumentRegistryEntry,
  InstrumentContext,
  InstrumentFrontendModule,
  VcsInfo,
} from "../shared/types.ts";
import { loadInstrumentFrontend } from "./instruments/instrument-loader.ts";

// ── RPC ──────────────────────────────────────────────────────────

const rpc = Electroview.defineRPC<any>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      snapshotUpdate: (snapshot: Snapshot) => {
        appState.update((s) => ({ ...s, snapshot }));
      },
      sessionStream: ({
        sessionId,
        event,
      }: {
        sessionId: string;
        event: ClaudeStreamEvent;
      }) => {
        updateSessionUsageEstimate(sessionId, event);
        const state = appState.get();
        const isActiveSessionEvent = sessionIdsMatch(state.activeSessionId, sessionId);
        const isResultEvent = (event as any).type === "result";
        const isStopHook = isStopHookEvent(event);
        const isDiffMutation = isDiffMutationEvent(event);
        const hasPinnedCommitDiff = activeCommitDiff
          ? activeCommitDiff.cwd === state.activeStage
          : false;
        if (isActiveSessionEvent && chatView) {
          chatView.appendStreamEvent(event);
        }
        if (
          isActiveSessionEvent
          && state.activeStage
          && state.viewMode === "stages"
          && !hasPinnedCommitDiff
          && (isResultEvent || isDiffMutation)
        ) {
          stageFileCache.delete(state.activeStage);
          scheduleDiffRefresh(
            state.activeStage,
            state.diffScope,
            isResultEvent ? 0 : 120
          );
        }
        if (
          isActiveSessionEvent
          && state.activeStage
          && state.viewMode === "stages"
          && diffView?.isBranchPanelVisible
          && (isResultEvent || isStopHook)
        ) {
          scheduleBranchHistoryRefresh(
            state.activeStage,
            isResultEvent ? 0 : 120
          );
        }
        if (
          isActiveSessionEvent
          && state.activeStage
          && state.viewMode === "stages"
          && (isResultEvent || isStopHook || isDiffMutation)
        ) {
          scheduleCommitContextRefresh(
            state.activeStage,
            isResultEvent ? 0 : 120
          );
        }
      },
      sessionIdResolved: ({
        tempId,
        realId,
      }: {
        tempId: string;
        realId: string;
      }) => {
        registerSessionAlias(tempId, realId);
        remapAppSpawnedSession(tempId, realId);
        const state = appState.get();
        const live = remapLiveSessionIds(state.liveSessions);
        if (live.has(tempId)) {
          live.delete(tempId);
          live.add(realId);
        }
        const updates: Partial<AppState> = { liveSessions: live };
        const activeCanonical = resolveCanonicalSessionId(state.activeSessionId);
        if (activeCanonical !== state.activeSessionId) {
          updates.activeSessionId = activeCanonical;
        }
        appState.update((s) => ({ ...s, ...updates }));
        if (updates.activeSessionId) {
          void loadSessionTranscript(updates.activeSessionId);
        }
      },
      toolApproval: (req: ToolApprovalRequest) => {
        console.log("[webview] Tool approval request:", req.toolName, req.toolUseId, req.sessionId);
        const state = appState.get();
        // Only show approval dialog if this tool belongs to the active session
        if (chatView && sessionIdsMatch(state.activeSessionId, req.sessionId)) {
          chatView.showToolApproval(req, async (allow) => {
            try {
              await (rpc as any).request.respondToolApproval({
                toolUseId: req.toolUseId,
                allow,
              });
            } catch (err) {
              console.error("Failed to respond to tool approval:", err);
            }
          });
        }
      },
      sessionEnded: ({
        sessionId,
        exitCode,
      }: {
        sessionId: string;
        exitCode: number;
      }) => {
        console.log(`Session ${sessionId} ended with code ${exitCode}`);
        sessionUsageEstimates.delete(sessionId);
        removeAppSpawnedSession(sessionId);
        const state = appState.get();
        const hasPinnedCommitDiff = activeCommitDiff
          ? activeCommitDiff.cwd === state.activeStage
          : false;
        clearSessionAliasesFor(sessionId);
        const live = remapLiveSessionIds(state.liveSessions);
        live.delete(sessionId);
        appState.update((s) => ({ ...s, liveSessions: live }));
        // Refresh diff when a session ends (changes may have been made)
        if (state.activeStage && state.viewMode === "stages") {
          if (!hasPinnedCommitDiff) {
            loadDiff(state.activeStage);
          }
          if (diffView.isBranchPanelVisible) {
            scheduleBranchHistoryRefresh(state.activeStage, 0);
          }
          scheduleCommitContextRefresh(state.activeStage, 0);
        }
      },
      tasksChanged: ({
        stagePath,
        taskId,
      }: {
        stagePath: string;
        taskId?: string;
      }) => {
        void loadStageTasks(stagePath, true);
        const state = appState.get();
        if (!state.selectedTaskId) return;
        if (!taskId || taskId === state.selectedTaskId) {
          void loadTaskDetail(state.selectedTaskId, true);
        }
      },
      instrumentEvent: ({
        instrumentId,
        event,
        payload,
      }: {
        instrumentId: string;
        event: string;
        payload?: unknown;
      }) => {
        void handleInstrumentEvent(instrumentId, event, payload);
      },
      pullRequestAgentReviewChanged: ({
        repo,
        number,
      }: {
        repo: string;
        number: number;
      }) => {
        void handlePullRequestAgentReviewChangedMessage(repo, number);
      },
    },
  },
});

// @ts-ignore - electrobun is used internally by the webview runtime
const _electrobun = new Electrobun.Electroview({ rpc });
const TASKS_INSTRUMENT_ID = "tasks";
type ClientLogLevel = "debug" | "info" | "warn" | "error";
const bootTraceLines: string[] = [];
let fatalScreenVisible = false;

function stringifyForLog(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sendClientLog(level: ClientLogLevel, message: string, meta?: unknown): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message: String(message ?? ""),
    meta: meta ?? null,
  };
  void (rpc as any).request.logClient(payload).catch(() => {
    // best-effort only
  });
  if (level === "error") console.error(`[mainview] ${payload.message}`, meta ?? "");
  else if (level === "warn") console.warn(`[mainview] ${payload.message}`, meta ?? "");
  else if (level === "info") console.info(`[mainview] ${payload.message}`, meta ?? "");
  else console.debug(`[mainview] ${payload.message}`, meta ?? "");
}

function pushBootTrace(step: string, detail?: unknown): void {
  const line = `${new Date().toISOString()} ${step}${detail ? ` ${stringifyForLog(detail)}` : ""}`;
  bootTraceLines.push(line);
  if (bootTraceLines.length > 120) {
    bootTraceLines.shift();
  }
  sendClientLog("debug", `boot:${step}`, detail);
}

function renderFatalScreen(context: string, error: unknown): void {
  if (fatalScreenVisible) return;
  fatalScreenVisible = true;

  const host = qs("#app") ?? document.body;
  if (!host) return;
  host.replaceChildren();

  const container = h("div", {
    style: {
      height: "100vh",
      overflow: "auto",
      padding: "16px",
      color: "#f5f5f5",
      background: "#111315",
      fontFamily: "\"SF Mono\", Menlo, monospace",
      fontSize: "12px",
      lineHeight: "1.5",
    },
  }, [
    h("h2", {
      style: { marginBottom: "12px", fontSize: "16px", color: "#ffb4a6" },
    }, ["Tango UI crash report"]),
    h("div", {
      style: { marginBottom: "8px", color: "#fca5a5" },
    }, [`Context: ${context}`]),
    h("pre", {
      style: {
        whiteSpace: "pre-wrap",
        marginBottom: "12px",
      },
    }, [stringifyForLog(error)]),
    h("div", {
      style: { marginBottom: "6px", color: "#9ca3af" },
    }, ["Boot trace"]),
    h("pre", {
      style: {
        whiteSpace: "pre-wrap",
        color: "#d1d5db",
      },
    }, [bootTraceLines.join("\n")]),
  ]);

  host.appendChild(container);
}

function reportFatal(context: string, error: unknown, meta?: unknown): void {
  sendClientLog("error", `fatal:${context}`, {
    error: stringifyForLog(error),
    meta: meta ?? null,
    bootTrace: bootTraceLines,
  });
  renderFatalScreen(context, error);
}

window.addEventListener("error", (event) => {
  reportFatal("window.error", event.error ?? event.message, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportFatal("window.unhandledrejection", event.reason);
});

// ── State ────────────────────────────────────────────────────────

type AppState = {
  snapshot: Snapshot | null;
  viewMode: "stages" | "plugins" | "tasks" | "prs" | "connectors" | "instruments";
  filesListViewMode: FileListView;
  stages: string[];
  expandedStages: Set<string>;
  activeStage: string | null;
  activeSessionId: string | null;
  diffScope: DiffScope;
  branchHistory: Record<string, BranchCommit[]>; // stage path → commit history
  vcsInfoByStage: Record<string, VcsInfo>; // stage path → VCS kind + branch
  loadedBranchHistory: Set<string>; // stage paths that have fetched branch history
  commitContextByStage: Record<string, CommitContext>; // stage path → commit context
  historySessions: Record<string, HistorySession[]>; // stage path → history
  liveSessions: Set<string>; // session IDs with running processes
  customSessionNames: Record<string, string>; // sessionId → custom name
  plugins: InstalledPlugin[];
  pluginsLoading: boolean;
  pluginSelection: PluginSidebarSelection | null;
  instrumentEntries: InstrumentRegistryEntry[];
  instrumentsLoading: boolean;
  instrumentsError: string | null;
  activeInstrumentId: string | null;
  tasksByStage: Record<string, TaskCardSummary[]>;
  tasksLoading: boolean;
  selectedTaskId: string | null;
  selectedTaskDetail: TaskCardDetail | null;
  connectorsByStage: Record<string, StageConnector[]>;
  connectorsLoading: boolean;
  connectorAuthSession: ConnectorAuthSession | null;
  assignedPullRequests: PullRequestSummary[];
  reviewRequestedPullRequests: PullRequestSummary[];
  openedPullRequests: PullRequestSummary[];
  pullRequestsLoading: boolean;
  pullRequestsError: string | null;
  pullRequestsFetchedAt: number | null;
  selectedPullRequest: { repo: string; number: number } | null;
  selectedPullRequestDetail: PullRequestDetail | null;
  pullRequestDetailLoading: boolean;
  pullRequestDetailError: string | null;
  selectedPullRequestCommitSha: string | null;
  pullRequestReviewState: PullRequestReviewState | null;
  pullRequestAgentReviews: PullRequestAgentReviewRun[];
  pullRequestAgentReviewsLoading: boolean;
  pullRequestAgentReviewsError: string | null;
  selectedPullRequestAgentReviewVersion: number | null;
  selectedPullRequestAgentReviewDocument: PullRequestAgentReviewDocument | null;
  pullRequestAgentReviewStarting: boolean;
};

type SessionUsageEstimate = {
  promptTokens: number | null;
  model: string | null;
};

type AppSpawnedSessionMeta = {
  cwd: string;
  topic: string | null;
  startedAt: string;
  updatedAt: string;
};

const FILES_LIST_VIEW_MODE_STORAGE_KEY = "claudex.filesListViewMode";
const INITIAL_FILES_LIST_VIEW_MODE = loadPersistedFilesListViewMode();

const appState = new Store<AppState>({
  snapshot: null,
  viewMode: "stages",
  filesListViewMode: INITIAL_FILES_LIST_VIEW_MODE,
  stages: [],
  expandedStages: new Set(),
  activeStage: null,
  activeSessionId: null,
  diffScope: "last_turn",
  branchHistory: {},
  vcsInfoByStage: {},
  loadedBranchHistory: new Set(),
  commitContextByStage: {},
  historySessions: {},
  liveSessions: new Set(),
  customSessionNames: {},
  plugins: [],
  pluginsLoading: false,
  pluginSelection: null,
  instrumentEntries: [],
  instrumentsLoading: false,
  instrumentsError: null,
  activeInstrumentId: null,
  tasksByStage: {},
  tasksLoading: false,
  selectedTaskId: null,
  selectedTaskDetail: null,
  connectorsByStage: {},
  connectorsLoading: false,
  connectorAuthSession: null,
  assignedPullRequests: [],
  reviewRequestedPullRequests: [],
  openedPullRequests: [],
  pullRequestsLoading: false,
  pullRequestsError: null,
  pullRequestsFetchedAt: null,
  selectedPullRequest: null,
  selectedPullRequestDetail: null,
  pullRequestDetailLoading: false,
  pullRequestDetailError: null,
  selectedPullRequestCommitSha: null,
  pullRequestReviewState: null,
  pullRequestAgentReviews: [],
  pullRequestAgentReviewsLoading: false,
  pullRequestAgentReviewsError: null,
  selectedPullRequestAgentReviewVersion: null,
  selectedPullRequestAgentReviewDocument: null,
  pullRequestAgentReviewStarting: false,
});

// ── Components ───────────────────────────────────────────────────

let panelLayout: PanelLayout;
let sidebar: Sidebar;
let pluginsSidebar: PluginsSidebar;
let instrumentsSidebar: InstrumentsSidebar;
let tasksSidebar: TasksSidebar;
let prsSidebar: PRsSidebar;
let connectorsSidebar: ConnectorsSidebar;
let pluginsPreview: PluginsPreview;
let tasksView: TasksView;
let prView: PRView;
let connectorsView: ConnectorsView;
let chatView: ChatView;
let diffView: DiffView;
let filesPanel: FilesPanel;
let branchPanel: BranchPanel;
let commitModal: CommitModal;
let sidebarPrimaryPluginsBtn: HTMLButtonElement | null = null;
let sidebarPrimaryTasksBtn: HTMLButtonElement | null = null;
let sidebarPrimaryInstrumentsBtn: HTMLButtonElement | null = null;
let sidebarPrimaryPRsBtn: HTMLButtonElement | null = null;
let sidebarPrimaryConnectorsBtn: HTMLButtonElement | null = null;
let sidebarPrimaryRuntimeInstrumentsHost: HTMLElement | null = null;
let instrumentRuntimeSidebarShell: HTMLElement | null = null;
let instrumentRuntimeSidebarHost: HTMLElement | null = null;
let instrumentRuntimeSidebarTitleEl: HTMLElement | null = null;
let instrumentFirstPanelHost: HTMLElement | null = null;
let instrumentSecondPanelHost: HTMLElement | null = null;
let activeRuntimeInstrumentId: string | null = null;
let activeRuntimeInstrumentModule: InstrumentFrontendModule | null = null;
let runtimeInstrumentDeactivating = false;
const runtimePanelVisibility = {
  sidebar: false,
  first: false,
  second: false,
};
let diffRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let branchHistoryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let commitContextRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let connectorAuthPollTimer: ReturnType<typeof setTimeout> | null = null;
const STAGE_FILE_CACHE_MS = 30_000;
const PULL_REQUEST_CACHE_TTL_MS = 5 * 60_000;
const stageFileCache = new Map<string, {
  files: string[];
  loadedAt: number;
}>();
const SLASH_COMMAND_CACHE_MS = 15_000;
const slashCommandCache = new Map<string, {
  commands: SlashCommandEntry[];
  loadedAt: number;
}>();
const sessionUsageEstimates = new Map<string, SessionUsageEstimate>();
const appSpawnedSessions = new Map<string, AppSpawnedSessionMeta>();
const sessionIdAliases = new Map<string, string>();
const EMPTY_BRANCH_COMMITS: BranchCommit[] = [];
let prevBranchStage: string | null = null;
let prevBranchCommits: BranchCommit[] | null = null;
let prevConnectorsStage: string | null = null;
let activeCommitDiff: { cwd: string; hash: string } | null = null;
let cachedPullRequestDiff: {
  repo: string;
  number: number;
  commitSha: string | null;
  files: DiffFile[];
  loadedAt: number;
} | null = null;
let prevViewMode: AppState["viewMode"] | null = null;
let prevChatPanelFixed: boolean | null = null;
let transcriptLoadSeq = 0;

function init(): void {
  pushBootTrace("init:start");
  try {
    const panelsContainer = qs("#panels");
    if (!panelsContainer) {
      throw new Error("Missing #panels root");
    }

    // Create 3-column panel layout
    panelLayout = new PanelLayout(panelsContainer, [
      {
        id: "stages",
        minWidth: 0,
        defaultWidth: 15,
        fixedPercent: 15,
        resizable: false,
        hidden: false,
      },
      { id: "chat", minWidth: 280, defaultWidth: 35 },
      { id: "diff", minWidth: 320, defaultWidth: 65 },
    ]);

    const wsPanel = panelLayout.getPanel("stages");
    const chatPanel = panelLayout.getPanel("chat");
    const diffPanel = panelLayout.getPanel("diff");
    if (!wsPanel || !chatPanel || !diffPanel) {
      throw new Error("Failed to initialize one or more panel roots");
    }

  const sidebarViews = h("div", { class: "sidebar-mode-views" });
  const stagesSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-stages",
  });
  const pluginsSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-plugins",
    hidden: true,
  });
  const instrumentsSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-instruments",
    hidden: true,
  });
  const tasksSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-tasks",
    hidden: true,
  });
  const prsSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-prs",
    hidden: true,
  });
  const connectorsSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-connectors",
    hidden: true,
  });
  sidebarViews.appendChild(stagesSidebarHost);
  sidebarViews.appendChild(pluginsSidebarHost);
  sidebarViews.appendChild(instrumentsSidebarHost);
  sidebarViews.appendChild(tasksSidebarHost);
  sidebarViews.appendChild(prsSidebarHost);
  sidebarViews.appendChild(connectorsSidebarHost);

  sidebarPrimaryPluginsBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      appState.update((s) => ({ ...s, viewMode: "plugins" }));
      panelLayout.showPanel("stages");
      qs("#btn-toggle-stages")?.classList.add("active");
      void loadPlugins(true);
    },
  }, [
    pluginToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["Plugins"]),
  ]) as HTMLButtonElement;

  sidebarPrimaryTasksBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      void openTasksInstrumentFromSidebar();
    },
  }, [
    tasksToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["Tasks"]),
  ]) as HTMLButtonElement;

  sidebarPrimaryInstrumentsBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      appState.update((s) => ({ ...s, viewMode: "instruments" }));
      panelLayout.showPanel("stages");
      qs("#btn-toggle-stages")?.classList.add("active");
      void loadInstruments(true);
    },
  }, [
    pluginToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["Instruments"]),
  ]) as HTMLButtonElement;

  sidebarPrimaryPRsBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      void enterPullRequestsMode();
    },
  }, [
    pullRequestsToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["PRs"]),
  ]) as HTMLButtonElement;

  sidebarPrimaryConnectorsBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      appState.update((s) => ({ ...s, viewMode: "connectors" }));
      panelLayout.showPanel("stages");
      qs("#btn-toggle-stages")?.classList.add("active");
      const stagePath = appState.get().activeStage;
      if (stagePath) {
        void loadStageConnectors(stagePath, true);
      }
    },
  }, [
    connectorsToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["Connectors"]),
  ]) as HTMLButtonElement;

  sidebarPrimaryRuntimeInstrumentsHost = h("div", {
    class: "sidebar-primary-instruments-list",
    hidden: true,
  });

  const sidebarPrimaryActions = h("div", { class: "sidebar-primary-actions" }, [
    sidebarPrimaryPluginsBtn,
    sidebarPrimaryTasksBtn,
    sidebarPrimaryPRsBtn,
    sidebarPrimaryConnectorsBtn,
    sidebarPrimaryInstrumentsBtn,
    sidebarPrimaryRuntimeInstrumentsHost,
  ]);

  const sidebarShell = h("div", { class: "sidebar-shell" }, [
    sidebarPrimaryActions,
    sidebarViews,
  ]);
  wsPanel.appendChild(sidebarShell);

  // Stages sidebar
  sidebar = new Sidebar(stagesSidebarHost, {
    onSelectSession: (sessionId, stagePath) => {
      const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;
      appState.update((s) => ({
        ...s,
        activeSessionId: canonicalSessionId,
        activeStage: stagePath,
      }));
      loadSessionTranscript(canonicalSessionId);
      loadDiff(stagePath);
      ensureBranchHistory(stagePath);
    },
    onNewSession: (stagePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: null,
        activeStage: stagePath,
      }));
      chatView.clear();
      chatView.focus();
      loadDiff(stagePath);
      ensureBranchHistory(stagePath);
    },
    onAddStage: () => openStage(),
    onRemoveStage: (path) => removeStage(path),
    onDeleteSession: async (sessionId, stagePath) => {
      const state = appState.get();
      const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;
      const isLiveSession = state.liveSessions.has(sessionId)
        || state.liveSessions.has(canonicalSessionId);
      const transcriptPath = (state.historySessions[stagePath] ?? [])
        .find((h) => h.sessionId === sessionId || h.sessionId === canonicalSessionId)?.transcriptPath;

      if (isLiveSession) {
        try {
          await (rpc as any).request.killSession({ sessionId: canonicalSessionId });
        } catch (err) {
          console.error("Failed to kill session:", err);
        }
      }

      try {
        await (rpc as any).request.deleteSession({
          sessionId: canonicalSessionId,
          cwd: stagePath,
          transcriptPath,
        });
      } catch (err) {
        console.error("Failed to delete session transcript:", err);
      }

      appState.update((s) => {
        const live = remapLiveSessionIds(s.liveSessions);
        live.delete(sessionId);
        live.delete(canonicalSessionId);

        const names = { ...s.customSessionNames };
        delete names[sessionId];
        delete names[canonicalSessionId];

        const wsHistory = s.historySessions[stagePath] ?? [];
        const nextHistory = wsHistory.filter((h) =>
          h.sessionId !== sessionId && h.sessionId !== canonicalSessionId
        );

        return {
          ...s,
          liveSessions: live,
          historySessions: {
            ...s.historySessions,
            [stagePath]: nextHistory,
          },
          customSessionNames: names,
          activeSessionId: sessionIdsMatch(s.activeSessionId, canonicalSessionId)
            ? null
            : s.activeSessionId,
        };
      });

      const next = appState.get();
      if (!next.activeSessionId) {
        chatView.clear();
      }
      loadDiff(stagePath);
      loadSessionHistory(stagePath);
    },
    onToggleStage: (path) => {
      const state = appState.get();
      const wasExpanded = state.expandedStages.has(path);
      appState.update((s) => {
        const expanded = new Set(s.expandedStages);
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        return { ...s, expandedStages: expanded };
      });
      // Load history when expanding (if not already loaded)
      if (!wasExpanded && !state.historySessions[path]) {
        loadSessionHistory(path);
      }
    },
    onRenameSession: async (sessionId, newName) => {
      try {
        await (rpc as any).request.renameSession({ sessionId, newName });
        // Update local state to apply the custom name immediately
        appState.update((s) => ({
          ...s,
          customSessionNames: { ...s.customSessionNames, [sessionId]: newName },
        }));
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    },
  });

  // Plugins sidebar
  pluginsSidebar = new PluginsSidebar(pluginsSidebarHost, {
    onSelect: (selection) => {
      appState.update((s) => ({
        ...s,
        pluginSelection: selection,
      }));
    },
    onBack: () => {
      appState.update((s) => ({ ...s, viewMode: "stages" }));
    },
  });

  instrumentsSidebar = new InstrumentsSidebar(instrumentsSidebarHost, {
    onActivate: (instrumentId) => {
      void activateInstrument(instrumentId);
    },
    onBack: () => {
      appState.update((s) => ({ ...s, viewMode: "stages" }));
    },
    onAddLocal: () => {
      void installInstrumentFromLocalPath();
    },
    onToggleEnabled: (instrumentId, enabled) => {
      void setInstrumentEnabled(instrumentId, enabled);
    },
    onRemoveLocal: (instrumentId) => {
      void removeLocalInstrument(instrumentId);
    },
    onRetryMigration: (instrumentId) => {
      void retryBlockedInstrumentMigration(instrumentId);
    },
  });
  instrumentRuntimeSidebarTitleEl = h("span", {
    class: "tasks-sidebar-title instrument-runtime-sidebar-title",
  }, ["Instrument"]);
  instrumentRuntimeSidebarHost = h("div", {
    class: "instrument-panel-host instrument-panel-host-sidebar",
  });
  instrumentRuntimeSidebarShell = h("div", {
    class: "instrument-runtime-sidebar",
    hidden: true,
  }, [
    h("div", { class: "tasks-sidebar-header instrument-runtime-sidebar-header" }, [
      h("button", {
        class: "tasks-sidebar-back-btn",
        title: "Back to Stages",
        onclick: () => {
          void (async () => {
            await deactivateRuntimeInstrument();
            appState.update((s) => ({
              ...s,
              viewMode: "stages",
              instrumentsError: null,
            }));
          })();
        },
      }, ["\u2190"]),
      instrumentRuntimeSidebarTitleEl,
    ]),
    instrumentRuntimeSidebarHost,
  ]);
  instrumentsSidebarHost.appendChild(instrumentRuntimeSidebarShell);

  tasksSidebar = new TasksSidebar(tasksSidebarHost, {
    onSelectTask: (taskId, stagePath) => {
      appState.update((s) => ({
        ...s,
        selectedTaskId: taskId,
        activeStage: stagePath,
      }));
      void loadTaskDetail(taskId, true);
    },
    onCreateTask: (stagePath) => {
      void createTaskInStage(stagePath);
    },
    onBack: () => {
      appState.update((s) => ({ ...s, viewMode: "stages" }));
    },
  });

  prsSidebar = new PRsSidebar(prsSidebarHost, {
    onSelectPullRequest: (repo, number) => {
      appState.update((s) => ({
        ...s,
        selectedPullRequest: { repo, number },
        selectedPullRequestCommitSha: null,
        selectedPullRequestDetail: null,
        pullRequestReviewState: null,
        pullRequestDetailError: null,
        pullRequestAgentReviews: [],
        pullRequestAgentReviewsError: null,
        selectedPullRequestAgentReviewVersion: null,
        selectedPullRequestAgentReviewDocument: null,
        pullRequestAgentReviewStarting: false,
      }));
      void loadPullRequestDetail(repo, number, true);
    },
    onBack: () => {
      appState.update((s) => ({ ...s, viewMode: "stages" }));
    },
    onRefresh: () => {
      void refreshPullRequests();
    },
  });

  connectorsSidebar = new ConnectorsSidebar(connectorsSidebarHost, {
    onBack: () => {
      appState.update((s) => ({ ...s, viewMode: "stages" }));
    },
  });

  // Chat panel
  chatView = new ChatView(chatPanel, {
    onStopSession: async () => {
      const state = appState.get();
      const activeSessionId = resolveCanonicalSessionId(state.activeSessionId);
      if (!activeSessionId) return;
      try {
        await (rpc as any).request.killSession({
          sessionId: activeSessionId,
        });
      } catch (err) {
        console.error("Failed to kill session:", err);
      }
    },
    onSendPrompt: async (prompt, fullAccess, selectedFiles) => {
      const state = appState.get();
      const cwd = state.activeStage;
      if (!cwd) {
        openStage();
        return;
      }

      try {
        const canonicalActiveSessionId = resolveCanonicalSessionId(state.activeSessionId);
        const isLive = Boolean(
          canonicalActiveSessionId && state.liveSessions.has(canonicalActiveSessionId)
        );

        if (canonicalActiveSessionId && isLive) {
          // Send follow-up to a running session
          await (rpc as any).request.sendFollowUp({
            sessionId: canonicalActiveSessionId,
            text: prompt,
            fullAccess,
            selectedFiles,
          });
        } else {
          // New session or resume a historical/finished session
          const { sessionId } = await (rpc as any).request.sendPrompt({
            prompt,
            cwd,
            fullAccess,
            sessionId: canonicalActiveSessionId ?? undefined, // resume if set
            selectedFiles,
          });
          const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;
          registerAppSpawnedSession(
            canonicalSessionId,
            cwd,
            resolvePromptTitle(null, prompt)
          );
          appState.update((s) => {
            const live = remapLiveSessionIds(s.liveSessions);
            live.add(canonicalSessionId);
            const expanded = new Set(s.expandedStages);
            expanded.add(cwd);
            return {
              ...s,
              activeSessionId: canonicalSessionId,
              activeStage: cwd,
              liveSessions: live,
              expandedStages: expanded,
            };
          });
        }
      } catch (err) {
        console.error("Failed to send prompt:", err);
        const message = err instanceof Error ? err.message : String(err);
        chatView.appendStreamEvent({
          type: "error",
          error: { message },
        });
      }
    },
    onOpenInFinder: async (path) => {
      try {
        await (rpc as any).request.openInFinder({ path });
      } catch (err) {
        console.error("Failed to open Finder:", err);
      }
    },
    onSearchFiles: async (query) => {
      const cwd = appState.get().activeStage;
      if (!cwd) return [];
      return searchStageFiles(cwd, query, 30);
    },
    onSearchCommands: async (query) => {
      const cwd = appState.get().activeStage;
      if (!cwd) return [];
      return searchSlashCommands(cwd, query, 30);
    },
  });
  pluginsPreview = new PluginsPreview(chatPanel, {
    onSelect: (selection) => {
      appState.update((s) => ({
        ...s,
        pluginSelection: selection,
      }));
    },
  });
  instrumentFirstPanelHost = h("div", {
    class: "instrument-panel-host instrument-panel-host-first",
    hidden: true,
  });
  chatPanel.appendChild(instrumentFirstPanelHost);
  tasksView = new TasksView(diffPanel, {
    onUpdateTask: async (taskId, patch) => {
      await invokeTasksInstrument("updateTask", { taskId, patch });
    },
    onDeleteTask: async (taskId) => {
      const detail = appState.get().selectedTaskDetail;
      await invokeTasksInstrument("deleteTask", { taskId });
      if (!detail) return;
      appState.update((s) => ({
        ...s,
        selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
        selectedTaskDetail: s.selectedTaskId === taskId ? null : s.selectedTaskDetail,
      }));
      await loadStageTasks(detail.stagePath, true);
      const remaining = appState.get().tasksByStage[detail.stagePath] ?? [];
      const next = remaining[0] ?? null;
      if (next) {
        appState.update((s) => ({ ...s, selectedTaskId: next.id }));
        await loadTaskDetail(next.id, true);
      }
    },
    onOpenSession: async (taskId) => {
      const state = appState.get();
      const detail = state.selectedTaskDetail?.id === taskId
        ? state.selectedTaskDetail
        : await invokeTasksInstrument<TaskCardDetail | null>("getTaskDetail", { taskId });

      if (!detail) {
        throw new Error("Task not found");
      }

      const sessionId = String(detail.lastRun?.sessionId ?? "").trim();
      if (!sessionId) {
        throw new Error("No session found for this task");
      }
      const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;

      const expanded = new Set(appState.get().expandedStages);
      expanded.add(detail.stagePath);
      appState.update((s) => ({
        ...s,
        viewMode: "stages",
        activeStage: detail.stagePath,
        activeSessionId: canonicalSessionId,
        expandedStages: expanded,
      }));

      await loadSessionTranscript(canonicalSessionId);
      void loadSessionHistory(detail.stagePath);
      await loadDiff(detail.stagePath);
      ensureBranchHistory(detail.stagePath);
    },
    onAddSource: async (taskId, payload) => {
      await invokeTasksInstrument("addTaskSource", {
        taskId,
        kind: payload.kind,
        url: payload.url,
        content: payload.content,
      });
    },
    onUpdateSource: async (sourceId, patch) => {
      await invokeTasksInstrument("updateTaskSource", { sourceId, patch });
    },
    onRemoveSource: async (sourceId) => {
      await invokeTasksInstrument("removeTaskSource", { sourceId });
    },
    onFetchSource: async (sourceId) => {
      await invokeTasksInstrument("fetchTaskSource", { sourceId });
    },
    onOpenConnectors: () => {
      appState.update((s) => ({ ...s, viewMode: "connectors" }));
      const stagePath = appState.get().activeStage;
      if (stagePath) {
        void loadStageConnectors(stagePath, true);
      }
    },
    onRunAction: async (taskId, action) => {
      const detail = appState.get().selectedTaskDetail;
      const stagePath = detail?.stagePath ?? appState.get().activeStage ?? null;
      const result = await invokeTasksInstrument<{ runId: string; sessionId: string | null }>("runTaskAction", {
        taskId,
        action,
      });

      if (action !== "execute" || !result.sessionId) {
        if (stagePath) {
          await loadStageTasks(stagePath, true);
        }
        await loadTaskDetail(taskId, true);
        return;
      }

      if (stagePath) {
        const executionTitle = detail?.title
          ? `Task: ${detail.title}`
          : "Task execution";
        registerAppSpawnedSession(result.sessionId, stagePath, executionTitle);
      }

      appState.update((s) => {
        const canonicalSessionId = resolveCanonicalSessionId(result.sessionId!) ?? result.sessionId!;
        const live = remapLiveSessionIds(s.liveSessions);
        live.add(canonicalSessionId);
        const expanded = new Set(s.expandedStages);
        if (stagePath) {
          expanded.add(stagePath);
        }
        return {
          ...s,
          viewMode: "stages",
          activeStage: stagePath ?? s.activeStage,
          activeSessionId: canonicalSessionId,
          liveSessions: live,
          expandedStages: expanded,
        };
      });

      const canonicalSessionId = resolveCanonicalSessionId(result.sessionId) ?? result.sessionId;
      await loadSessionTranscript(canonicalSessionId);
      if (stagePath) {
        void loadStageTasks(stagePath, true);
        void loadSessionHistory(stagePath);
        await loadDiff(stagePath);
        ensureBranchHistory(stagePath);
      }
    },
  });
  prView = new PRView(chatPanel, {
    onSelectCommit: (commitSha) => {
      appState.update((s) => ({
        ...s,
        selectedPullRequestCommitSha: commitSha,
      }));
      void loadSelectedPullRequestDiff();
    },
    onOpenPullRequest: (url) => {
      void openExternalUrl(url);
    },
    onSelectFile: (path) => {
      diffView.showFile(path);
      filesPanel.setActiveFile(path);
    },
    onToggleFileSeen: (path, seen) => {
      void setPullRequestFileSeen(path, seen);
    },
    onFilesViewModeChange: (mode) => {
      setGlobalFilesListViewMode(mode);
    },
    onStartAgentReview: () => {
      void startPullRequestAgentReview();
    },
    onSelectAgentReviewVersion: (version) => {
      void selectPullRequestAgentReviewVersion(version);
    },
    onApplyAgentReviewIssue: async ({
      reviewVersion,
      suggestionIndex,
    }) => {
      await applyPullRequestAgentReviewIssue({
        reviewVersion,
        suggestionIndex,
      });
    },
  });
  connectorsView = new ConnectorsView(chatPanel, {
    onConnect: async (provider) => {
      const stagePath = appState.get().activeStage;
      if (!stagePath) {
        throw new Error("No active stage");
      }

      const authSession: ConnectorAuthSession = await (rpc as any).request.startConnectorAuth({
        stagePath,
        provider,
      });
      appState.update((s) => ({
        ...s,
        connectorAuthSession: authSession,
      }));

      if (authSession.authorizeUrl) {
        await openExternalUrl(authSession.authorizeUrl);
      }
      syncConnectorAuthPollTimer(appState.get());
      if (authSession.status !== "pending") {
        await loadStageConnectors(stagePath, true);
      }
    },
    onDisconnect: async (provider) => {
      const stagePath = appState.get().activeStage;
      if (!stagePath) {
        throw new Error("No active stage");
      }
      await (rpc as any).request.disconnectStageConnector({
        stagePath,
        provider,
      });
      appState.update((s) => ({
        ...s,
        connectorAuthSession: null,
      }));
      await loadStageConnectors(stagePath, true);
    },
    onOpenAuthLink: async (provider) => {
      const authSession = appState.get().connectorAuthSession;
      const authorizeUrl = authSession?.provider === provider
        ? authSession.authorizeUrl
        : null;
      if (!authorizeUrl) return;
      await openExternalUrl(authorizeUrl);
    },
  });

  // Diff panel
  commitModal = new CommitModal();
  diffView = new DiffView(diffPanel, {
    onBranchPanelToggle: (visible) => {
      const activeStage = appState.get().activeStage;
      if (!visible || !activeStage) return;
      void loadBranchHistory(activeStage, true);
    },
    onCommitClick: () => {
      void openCommitDialogForStage();
    },
    onRequestFullFile: async (path) => {
      if (appState.get().viewMode !== "stages") {
        throw new Error("Full file view is only available in stage mode");
      }
      const cwd = appState.get().activeStage;
      if (!cwd) {
        throw new Error("No active stage");
      }
      return (rpc as any).request.getFileContent({ cwd, path });
    },
    onToggleFileSeen: (path, seen) => {
      void setPullRequestFileSeen(path, seen);
    },
    onReplyReviewThread: async (thread, body) => {
      await replyPullRequestReviewThread(thread, body);
    },
    onCreateReviewComment: async (params) => {
      await createPullRequestReviewComment(params);
    },
  });
  instrumentSecondPanelHost = h("div", {
    class: "instrument-panel-host instrument-panel-host-second",
    hidden: true,
  });
  diffPanel.appendChild(instrumentSecondPanelHost);

  // Files panel (embedded inside diff panel)
  filesPanel = new FilesPanel(diffView.filesPanelHost, {
    onSelectFile: (path) => {
      diffView.showFile(path);
    },
    onScopeChange: (scope) => {
      appState.update((s) => ({ ...s, diffScope: scope }));
      const state = appState.get();
      if (state.viewMode === "stages" && state.activeStage) {
        loadDiff(state.activeStage, scope);
      }
    },
    onToggleFileSeen: (path, seen) => {
      void setPullRequestFileSeen(path, seen);
    },
    onViewModeChange: (mode) => {
      setGlobalFilesListViewMode(mode);
    },
  });

  // Branch panel (embedded inside diff panel)
  branchPanel = new BranchPanel(diffView.branchPanelHost, {
    onSelectCommit: (commit) => {
      const cwd = appState.get().activeStage;
      if (!cwd) return;

      const isSameSelection = activeCommitDiff
        && activeCommitDiff.cwd === cwd
        && activeCommitDiff.hash === commit.hash;

      if (isSameSelection) {
        activeCommitDiff = null;
        branchPanel.setActiveCommit(null);
        void loadDiff(cwd, appState.get().diffScope);
        return;
      }

      activeCommitDiff = { cwd, hash: commit.hash };
      branchPanel.setActiveCommit(commit.hash);
      void loadCommitDiff(cwd, commit.hash);
    },
  });

  // Toggle stages button
  qs("#btn-toggle-stages")?.addEventListener("click", () => {
    panelLayout.togglePanel("stages");
    qs("#btn-toggle-stages")?.classList.toggle(
      "active",
      panelLayout.isPanelVisible("stages")
    );
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
    if (!mod) return;

    if (e.key === "1") {
      e.preventDefault();
      panelLayout.togglePanel("stages");
      qs("#btn-toggle-stages")?.classList.toggle(
        "active",
        panelLayout.isPanelVisible("stages")
      );
      return;
    }

    if (e.key === "2") {
      e.preventDefault();
      panelLayout.togglePanel("chat");
      return;
    }

    if (e.key === "4") {
      e.preventDefault();
      if (appState.get().viewMode === "stages") {
        diffView.toggleFilesPanel();
      }
      return;
    }

    if (e.key === "5") {
      e.preventDefault();
      if (appState.get().viewMode === "stages") {
        diffView.toggleBranchPanel();
      }
      return;
    }

    if (e.key === "n") {
      e.preventDefault();
      const state = appState.get();
      if (state.activeStage) {
        appState.update((s) => ({ ...s, activeSessionId: null }));
        chatView.clear();
        chatView.focus();
      } else {
        openStage();
      }
      return;
    }

    if (e.key === "o") {
      e.preventDefault();
      openStage();
    }
  });

  // State subscription — rebuild sidebar on every snapshot or stage change
  appState.subscribe((state) => {
    try {
    const shouldFixChatPanel = state.viewMode === "stages" || state.viewMode === "prs";
    if (shouldFixChatPanel !== prevChatPanelFixed) {
      panelLayout.setPanelSizing(
        "chat",
        shouldFixChatPanel
          ? { fixedPercent: 35, resizable: false }
          : { fixedPercent: null, resizable: true }
      );
      prevChatPanelFixed = shouldFixChatPanel;
    }

    const viewModeChanged = prevViewMode !== null && prevViewMode !== state.viewMode;
    const sidebarWidthBeforeSwitch = viewModeChanged ? wsPanel.offsetWidth : 0;

    const wsData = buildStageData(state);
    sidebar.render(wsData);
    sidebar.setActiveSession(resolveCanonicalSessionId(state.activeSessionId));

    const pluginsSelection = resolvePluginSelection(
      state.plugins,
      state.pluginSelection
    );
    const isPluginsMode = state.viewMode === "plugins";
    const isInstrumentsMode = state.viewMode === "instruments";
    const isTasksMode = state.viewMode === "tasks";
    const isPRMode = state.viewMode === "prs";
    const isConnectorsMode = state.viewMode === "connectors";
    const runtimeInstrumentId = state.activeInstrumentId ?? activeRuntimeInstrumentId;
    const isRuntimeInstrumentMode = isInstrumentsMode
      && Boolean(activeRuntimeInstrumentModule)
      && Boolean(runtimeInstrumentId)
      && runtimeInstrumentId !== TASKS_INSTRUMENT_ID;
    const runtimeEntry = isRuntimeInstrumentMode
      ? (state.instrumentEntries.find((entry) => entry.id === runtimeInstrumentId) ?? null)
      : null;
    const runtimeShowsFirst = Boolean(runtimeEntry?.panels.first);
    const runtimeShowsSecond = Boolean(runtimeEntry?.panels.second);
    const tasksInstrumentEntry = state.instrumentEntries.find(
      (entry) => entry.id === TASKS_INSTRUMENT_ID
    ) ?? null;
    const hasTasksInstrument = Boolean(tasksInstrumentEntry);
    const canOpenTasks = Boolean(
      tasksInstrumentEntry
      && tasksInstrumentEntry.enabled
      && tasksInstrumentEntry.status !== "blocked"
    );
    const taskGroups = buildTaskStageGroups(state);
    const pullRequestSections = buildPullRequestSidebarSections(state);
    const pullRequestReviewMap = resolveSelectedPullRequestReviewMap(state);
    const pullRequestSeenCount = countSeenFiles(pullRequestReviewMap);
    const pullRequestTotalFiles = state.selectedPullRequestDetail?.files.length ?? 0;
    const activeStageConnectors = resolveActiveStageConnectors(state);
    const activeStageAuthSession = state.connectorAuthSession?.stagePath === state.activeStage
      ? state.connectorAuthSession
      : null;
    if (
      activeRuntimeInstrumentId
      && !runtimeInstrumentDeactivating
      && (!isInstrumentsMode || state.activeInstrumentId !== activeRuntimeInstrumentId)
    ) {
      void deactivateRuntimeInstrument();
    }

    sidebarPrimaryActions.hidden = isPluginsMode
      || isInstrumentsMode
      || isTasksMode
      || isPRMode
      || isConnectorsMode;
    stagesSidebarHost.hidden = isPluginsMode
      || isInstrumentsMode
      || isTasksMode
      || isPRMode
      || isConnectorsMode;
    pluginsSidebarHost.hidden = !isPluginsMode;
    instrumentsSidebarHost.hidden = !isInstrumentsMode;
    tasksSidebarHost.hidden = !isTasksMode;
    prsSidebarHost.hidden = !isPRMode;
    connectorsSidebarHost.hidden = !isConnectorsMode;
    sidebarPrimaryPluginsBtn?.classList.toggle("active", isPluginsMode);
    if (sidebarPrimaryTasksBtn) {
      sidebarPrimaryTasksBtn.hidden = !hasTasksInstrument;
      sidebarPrimaryTasksBtn.disabled = !canOpenTasks;
      sidebarPrimaryTasksBtn.title = canOpenTasks
        ? "Open Tasks"
        : (tasksInstrumentEntry?.lastError ?? "Tasks instrument is unavailable");
    }
    sidebarPrimaryTasksBtn?.classList.toggle("active", isTasksMode);
    sidebarPrimaryInstrumentsBtn?.classList.toggle("active", isInstrumentsMode);
    sidebarPrimaryPRsBtn?.classList.toggle("active", isPRMode);
    sidebarPrimaryConnectorsBtn?.classList.toggle("active", isConnectorsMode);
    if (sidebarPrimaryRuntimeInstrumentsHost) {
      const shortcuts = state.instrumentEntries.filter((entry) =>
        entry.id !== TASKS_INSTRUMENT_ID
        && entry.enabled
        && entry.status !== "blocked"
      );
      sidebarPrimaryRuntimeInstrumentsHost.hidden = shortcuts.length === 0;
      clearChildren(sidebarPrimaryRuntimeInstrumentsHost);
      for (const entry of shortcuts) {
        const shortcutBtn = h("button", {
          class: "sidebar-primary-btn",
          title: `Open ${entry.name}`,
          onclick: () => {
            void activateInstrument(entry.id);
          },
        }, [
          pluginToolIcon("sidebar-primary-icon"),
          h("span", { class: "sidebar-primary-label" }, [entry.name]),
        ]) as HTMLButtonElement;
        shortcutBtn.classList.toggle(
          "active",
          state.viewMode === "instruments" && state.activeInstrumentId === entry.id
        );
        sidebarPrimaryRuntimeInstrumentsHost.appendChild(shortcutBtn);
      }
    }

    pluginsSidebar.render(state.plugins, { loading: state.pluginsLoading });
    pluginsSidebar.setSelection(pluginsSelection);
    instrumentsSidebar.render(state.instrumentEntries, {
      loading: state.instrumentsLoading,
      error: state.instrumentsError,
    });
    instrumentsSidebar.setActive(state.activeInstrumentId);
    const runtimeUsesSidebar = Boolean(runtimeEntry?.panels.sidebar);
    if (instrumentsSidebar.element) {
      instrumentsSidebar.element.hidden = !isInstrumentsMode
        || (isRuntimeInstrumentMode && runtimeUsesSidebar);
    }
    if (instrumentRuntimeSidebarTitleEl) {
      const runtimeTitle = runtimeEntry?.name
        ?? (
          activeRuntimeInstrumentId
            ? state.instrumentEntries.find((entry) => entry.id === activeRuntimeInstrumentId)?.name
            : null
        )
        ?? "Instrument";
      instrumentRuntimeSidebarTitleEl.textContent = runtimeTitle;
    }
    syncRuntimePanelVisibility(isRuntimeInstrumentMode, runtimeEntry);
    tasksSidebar.render(taskGroups, { loading: state.tasksLoading });
    tasksSidebar.setSelection(state.selectedTaskId);
    prsSidebar.render(pullRequestSections, {
      loading: state.pullRequestsLoading,
      error: state.pullRequestsError,
    });
    prsSidebar.setSelection(state.selectedPullRequest);
    pluginsPreview.render(state.plugins, pluginsSelection, {
      loading: state.pluginsLoading,
    });
    tasksView.render(state.selectedTaskDetail, {
      loading: state.tasksLoading && Boolean(state.selectedTaskId),
    });
    prView.render(state.selectedPullRequestDetail, {
      loading: state.pullRequestDetailLoading,
      error: state.pullRequestDetailError,
      selectedCommitSha: state.selectedPullRequestCommitSha,
      seenCount: pullRequestSeenCount,
      totalFiles: pullRequestTotalFiles,
      fileReviewState: pullRequestReviewMap,
      filesViewMode: state.filesListViewMode,
      agentReviews: state.pullRequestAgentReviews,
      agentReviewsLoading: state.pullRequestAgentReviewsLoading,
      agentReviewsError: state.pullRequestAgentReviewsError,
      selectedAgentReviewVersion: state.selectedPullRequestAgentReviewVersion,
      selectedAgentReviewDocument: state.selectedPullRequestAgentReviewDocument,
      agentReviewStarting: state.pullRequestAgentReviewStarting,
    });
    connectorsView.render(activeStageConnectors, {
      loading: state.connectorsLoading,
      authSession: activeStageAuthSession,
      stagePath: state.activeStage,
    });

    chatView.element.hidden = isPluginsMode
      || isInstrumentsMode
      || isTasksMode
      || isPRMode
      || isConnectorsMode;
    pluginsPreview.setVisible(isPluginsMode);
    tasksView.setVisible(isTasksMode);
    prView.setVisible(isPRMode);
    connectorsView.setVisible(isConnectorsMode);
    diffView.element.hidden = isTasksMode || isRuntimeInstrumentMode;

    if (state.activeStage && state.activeStage !== prevConnectorsStage) {
      prevConnectorsStage = state.activeStage;
      void loadStageConnectors(state.activeStage, false);
    } else if (!state.activeStage) {
      prevConnectorsStage = null;
    }

    syncConnectorAuthPollTimer(state);

    const hideChatPanel = isTasksMode
      || (isRuntimeInstrumentMode && (!runtimeShowsFirst || !runtimePanelVisibility.first));
    const hideDiffPanel = isPluginsMode
      || isConnectorsMode
      || (isInstrumentsMode && !isRuntimeInstrumentMode)
      || (isRuntimeInstrumentMode && (!runtimeShowsSecond || !runtimePanelVisibility.second));
    if (hideChatPanel && hideDiffPanel) {
      panelLayout.showPanel("stages");
      qs("#btn-toggle-stages")?.classList.add("active");
    }

    if (hideChatPanel) panelLayout.hidePanel("chat");
    else panelLayout.showPanel("chat");

    if (hideDiffPanel) panelLayout.hidePanel("diff");
    else panelLayout.showPanel("diff");

    // Last-resort guard: avoid ending up with all panels hidden.
    if (
      !panelLayout.isPanelVisible("stages")
      && !panelLayout.isPanelVisible("chat")
      && !panelLayout.isPanelVisible("diff")
    ) {
      panelLayout.showPanel("stages");
      panelLayout.showPanel("chat");
      qs("#btn-toggle-stages")?.classList.add("active");
    }

    if (hideDiffPanel) {
      if (sidebarWidthBeforeSwitch > 0) {
        panelLayout.preservePanelPixelWidth("stages", sidebarWidthBeforeSwitch);
      }
      prevViewMode = state.viewMode;
      return;
    }
    if (sidebarWidthBeforeSwitch > 0) {
      panelLayout.preservePanelPixelWidth("stages", sidebarWidthBeforeSwitch);
    }

    if (isTasksMode) {
      if (commitModal.isOpen) {
        commitModal.close();
      }
      prevViewMode = state.viewMode;
      return;
    }

    if (isRuntimeInstrumentMode) {
      if (commitModal.isOpen) {
        commitModal.close();
      }
      prevViewMode = state.viewMode;
      return;
    }

    filesPanel.setReviewMode(isPRMode);
    filesPanel.setViewMode(state.filesListViewMode);
    filesPanel.setFileReviewState(
      isPRMode ? pullRequestReviewMap : new Map()
    );
    diffView.setReviewMode(isPRMode);
    diffView.setFileReviewState(
      isPRMode ? pullRequestReviewMap : new Map()
    );
    syncCommitButtonVisibility(state);
    if (state.viewMode !== "stages" && commitModal.isOpen) {
      commitModal.close();
    }
    if (isPRMode && !state.selectedPullRequestDetail) {
      filesPanel.clear();
      diffView.clear();
    }
    if (isPRMode && diffView.isBranchPanelVisible) {
      diffView.setBranchPanelVisible(false, false);
    }

    if (
      viewModeChanged
      && (prevViewMode === "prs" || prevViewMode === "tasks")
      && state.viewMode === "stages"
      && state.activeStage
    ) {
      clearCommitDiffSelection(state.activeStage);
      void loadDiff(state.activeStage, state.diffScope);
      ensureBranchHistory(state.activeStage);
    }

    prevViewMode = state.viewMode;

    if (isPRMode) {
      branchPanel.clear();
      return;
    }

    chatView.setHeader(
      resolveActiveSessionTitle(state),
      state.activeStage
    );
    const contextInfo = resolveActiveContextUsage(state);
    chatView.setContextUsage(
      contextInfo?.contextPercentage ?? null,
      contextInfo?.model ?? null,
      contextInfo?.activity ?? null,
      contextInfo?.promptTokens ?? null
    );

    const activeStage = state.activeStage;
    const branchCommits = activeStage
      ? (state.branchHistory[activeStage] ?? EMPTY_BRANCH_COMMITS)
      : EMPTY_BRANCH_COMMITS;
    if (
      activeStage !== prevBranchStage
      || branchCommits !== prevBranchCommits
    ) {
      if (activeStage) {
        branchPanel.render(branchCommits);
        const activeCommitHash = activeCommitDiff?.cwd === activeStage
          ? activeCommitDiff.hash
          : null;
        branchPanel.setActiveCommit(activeCommitHash);
      } else {
        branchPanel.clear();
      }
      prevBranchStage = activeStage;
      prevBranchCommits = branchCommits;
    }
    } catch (err) {
      reportFatal("state.render", err, {
        viewMode: state.viewMode,
        activeStage: state.activeStage,
        activeInstrumentId: state.activeInstrumentId,
        activeRuntimeInstrumentId,
      });
    }
  });

  // Force first render pass even before async loaders return.
  pushBootTrace("state:initial-render");
  appState.update((s) => s);

  // Load initial data
  pushBootTrace("load:initial-data");
  loadStages();
  loadSessionNames();
  loadPlugins();
  loadInstruments();

  // Keep instrument registry fresh when app regains focus.
  window.addEventListener("focus", () => {
    void loadInstruments(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void loadInstruments(true);
    }
  });
    pushBootTrace("init:ready");
  } catch (err) {
    reportFatal("init", err);
    throw err;
  }
}

// ── Actions ──────────────────────────────────────────────────────

async function invokeTasksInstrument<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response: { result: T } = await (rpc as any).request.instrumentInvoke({
    instrumentId: TASKS_INSTRUMENT_ID,
    method,
    params,
  });
  return response.result;
}

async function openTasksInstrumentFromSidebar(): Promise<void> {
  await loadInstruments(false);
  const hasTasks = appState.get().instrumentEntries.some((entry) => entry.id === TASKS_INSTRUMENT_ID);
  if (!hasTasks) {
    appState.update((s) => ({
      ...s,
      viewMode: "instruments",
      instrumentsError: "Tasks instrument is not installed",
    }));
    return;
  }
  await activateInstrument(TASKS_INSTRUMENT_ID);
}

function syncRuntimePanelVisibility(
  isRuntimeInstrumentMode: boolean,
  entry: InstrumentRegistryEntry | null
): void {
  const allowSidebar = Boolean(entry?.panels.sidebar);
  const allowFirst = Boolean(entry?.panels.first);
  const allowSecond = Boolean(entry?.panels.second);
  if (instrumentRuntimeSidebarShell) {
    instrumentRuntimeSidebarShell.hidden = !(isRuntimeInstrumentMode && allowSidebar);
  }
  if (instrumentRuntimeSidebarHost) {
    instrumentRuntimeSidebarHost.hidden = !(
      isRuntimeInstrumentMode
      && allowSidebar
      && runtimePanelVisibility.sidebar
    );
  }
  if (instrumentFirstPanelHost) {
    instrumentFirstPanelHost.hidden = !(
      isRuntimeInstrumentMode
      && allowFirst
      && runtimePanelVisibility.first
    );
  }
  if (instrumentSecondPanelHost) {
    instrumentSecondPanelHost.hidden = !(
      isRuntimeInstrumentMode
      && allowSecond
      && runtimePanelVisibility.second
    );
  }
}

function getInstrumentSlotHost(
  entry: InstrumentRegistryEntry,
  slot: "sidebar" | "first" | "second" | "right"
): HTMLElement {
  if (slot === "right") {
    throw new Error("Instrument slot 'right' is not supported in this runtime slice yet");
  }

  if (slot === "sidebar") {
    if (!entry.panels.sidebar) {
      throw new Error(
        `Instrument '${entry.id}' cannot mount sidebar panel (manifest panels.sidebar=false)`
      );
    }
    if (!instrumentRuntimeSidebarHost) {
      throw new Error("Runtime sidebar host is not initialized");
    }
    return instrumentRuntimeSidebarHost;
  }

  if (slot === "first") {
    if (!entry.panels.first) {
      throw new Error(
        `Instrument '${entry.id}' cannot mount first panel (manifest panels.first=false)`
      );
    }
    if (!instrumentFirstPanelHost) {
      throw new Error("Runtime first panel host is not initialized");
    }
    return instrumentFirstPanelHost;
  }

  if (!entry.panels.second) {
    throw new Error(
      `Instrument '${entry.id}' cannot mount second panel (manifest panels.second=false)`
    );
  }
  if (!instrumentSecondPanelHost) {
    throw new Error("Runtime second panel host is not initialized");
  }
  return instrumentSecondPanelHost;
}

function setRuntimeSlotVisibility(
  slot: "sidebar" | "first" | "second" | "right",
  visible: boolean
): void {
  if (slot === "right") {
    throw new Error("Instrument slot 'right' is not supported in this runtime slice yet");
  }
  if (slot === "sidebar") {
    runtimePanelVisibility.sidebar = visible;
    return;
  }
  if (slot === "first") {
    runtimePanelVisibility.first = visible;
    return;
  }
  runtimePanelVisibility.second = visible;
}

function clearInstrumentPanelHosts(): void {
  runtimePanelVisibility.sidebar = false;
  runtimePanelVisibility.first = false;
  runtimePanelVisibility.second = false;
  if (instrumentRuntimeSidebarHost) {
    instrumentRuntimeSidebarHost.replaceChildren();
    instrumentRuntimeSidebarHost.hidden = true;
  }
  if (instrumentRuntimeSidebarShell) {
    instrumentRuntimeSidebarShell.hidden = true;
  }
  if (instrumentFirstPanelHost) {
    instrumentFirstPanelHost.replaceChildren();
    instrumentFirstPanelHost.hidden = true;
  }
  if (instrumentSecondPanelHost) {
    instrumentSecondPanelHost.replaceChildren();
    instrumentSecondPanelHost.hidden = true;
  }
}

async function deactivateRuntimeInstrument(): Promise<void> {
  if (runtimeInstrumentDeactivating) return;
  runtimeInstrumentDeactivating = true;
  const module = activeRuntimeInstrumentModule;
  activeRuntimeInstrumentId = null;
  activeRuntimeInstrumentModule = null;
  try {
    if (module?.deactivate) {
      await module.deactivate();
    }
  } catch (err) {
    console.error("Failed to deactivate runtime instrument:", err);
  } finally {
    clearInstrumentPanelHosts();
    runtimeInstrumentDeactivating = false;
  }
}

function buildInstrumentContext(entry: InstrumentRegistryEntry): InstrumentContext {
  return {
    instrumentId: entry.id,
    permissions: entry.permissions,
    panels: {
      mount: (slot, node) => {
        const host = getInstrumentSlotHost(entry, slot);
        host.replaceChildren(node);
      },
      unmount: (slot) => {
        const host = getInstrumentSlotHost(entry, slot);
        host.replaceChildren();
      },
      setVisible: (slot, visible) => {
        setRuntimeSlotVisibility(slot, visible);
        const state = appState.get();
        const isRuntimeInstrumentMode = state.viewMode === "instruments"
          && state.activeInstrumentId === entry.id
          && activeRuntimeInstrumentId === entry.id;
        const runtimeEntry = isRuntimeInstrumentMode
          ? (state.instrumentEntries.find((item) => item.id === entry.id) ?? entry)
          : entry;
        syncRuntimePanelVisibility(isRuntimeInstrumentMode, runtimeEntry);
      },
    },
    storage: {
      getProperty: async <T = unknown>(key: string): Promise<T | null> => {
        const response: { value: unknown | null } = await (rpc as any).request.instrumentStorageGetProperty({
          instrumentId: entry.id,
          key,
        });
        return response.value as T | null;
      },
      setProperty: async (key, value) => {
        await (rpc as any).request.instrumentStorageSetProperty({
          instrumentId: entry.id,
          key,
          value,
        });
      },
      deleteProperty: async (key) => {
        await (rpc as any).request.instrumentStorageDeleteProperty({
          instrumentId: entry.id,
          key,
        });
      },
      readFile: async (path, encoding = "utf8") => {
        const response: { content: string } = await (rpc as any).request.instrumentStorageReadFile({
          instrumentId: entry.id,
          path,
          encoding,
        });
        return response.content;
      },
      writeFile: async (path, content, encoding = "utf8") => {
        await (rpc as any).request.instrumentStorageWriteFile({
          instrumentId: entry.id,
          path,
          content,
          encoding,
        });
      },
      deleteFile: async (path) => {
        await (rpc as any).request.instrumentStorageDeleteFile({
          instrumentId: entry.id,
          path,
        });
      },
      listFiles: async (dir = "") => {
        return (rpc as any).request.instrumentStorageListFiles({
          instrumentId: entry.id,
          dir,
        });
      },
      sqlQuery: async <T extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
        db = "main"
      ): Promise<T[]> => {
        const response: { rows: Record<string, unknown>[] } = await (rpc as any).request.instrumentStorageSqlQuery({
          instrumentId: entry.id,
          db,
          sql,
          params,
        });
        return response.rows as T[];
      },
      sqlExecute: async (sql, params = [], db = "main") => {
        return (rpc as any).request.instrumentStorageSqlExecute({
          instrumentId: entry.id,
          db,
          sql,
          params,
        });
      },
    },
    sessions: {
      spawn: async (params) => {
        const response: { sessionId: string } = await (rpc as any).request.sendPrompt({
          prompt: params.prompt,
          cwd: params.cwd,
          fullAccess: params.fullAccess ?? true,
          sessionId: params.sessionId,
          selectedFiles: params.selectedFiles ?? [],
        });
        return { sessionId: response.sessionId };
      },
      sendFollowUp: async (params) => {
        await (rpc as any).request.sendFollowUp({
          sessionId: params.sessionId,
          text: params.text,
          fullAccess: params.fullAccess ?? true,
          selectedFiles: params.selectedFiles ?? [],
        });
      },
      kill: async (sessionId) => {
        await (rpc as any).request.killSession({ sessionId });
      },
      list: async () => {
        return (rpc as any).request.getSessions({});
      },
    },
    connectors: {
      listStageConnectors: async (stagePath) => {
        return (rpc as any).request.getStageConnectors({ stagePath });
      },
      isAuthorized: async (stagePath, provider) => {
        const connectors: StageConnector[] = await (rpc as any).request.getStageConnectors({ stagePath });
        return connectors.some((connector) => connector.provider === provider && connector.status === "connected");
      },
      connect: async (stagePath, provider) => {
        return (rpc as any).request.startConnectorAuth({ stagePath, provider });
      },
      disconnect: async (stagePath, provider) => {
        await (rpc as any).request.disconnectStageConnector({ stagePath, provider });
      },
    },
    stages: {
      list: async () => {
        return (rpc as any).request.getStages({});
      },
      active: async () => {
        return appState.get().activeStage;
      },
    },
    invoke: async <T = unknown>(
      method: string,
      params?: Record<string, unknown>
    ): Promise<T> => {
      const response: { result: T } = await (rpc as any).request.instrumentInvoke({
        instrumentId: entry.id,
        method,
        params,
      });
      return response.result;
    },
    registerShortcut: () => {},
    emit: () => {},
  };
}

async function activateRuntimeInstrument(entry: InstrumentRegistryEntry): Promise<void> {
  await deactivateRuntimeInstrument();
  runtimePanelVisibility.sidebar = Boolean(entry.panels.sidebar);
  runtimePanelVisibility.first = Boolean(entry.panels.first);
  runtimePanelVisibility.second = Boolean(entry.panels.second);
  const module = await loadInstrumentFrontend(
    entry,
    async (instrumentId) => {
      return (rpc as any).request.getInstrumentFrontendSource({ instrumentId });
    }
  );
  const ctx = buildInstrumentContext(entry);
  try {
    await module.activate(ctx);
    activeRuntimeInstrumentId = entry.id;
    activeRuntimeInstrumentModule = module;
    syncRuntimePanelVisibility(true, entry);
  } catch (err) {
    try {
      await module.deactivate?.();
    } catch (deactivateErr) {
      console.error("Failed to rollback runtime instrument activation:", deactivateErr);
    }
    clearInstrumentPanelHosts();
    throw err;
  }
}

async function loadSessionTranscript(sessionId: string): Promise<void> {
  const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;
  const loadSeq = ++transcriptLoadSeq;
  try {
    const activeSessionId = resolveCanonicalSessionId(appState.get().activeSessionId);
    if (!sessionIdsMatch(activeSessionId, canonicalSessionId)) {
      return;
    }

    // Check if this is a historical session with a known transcript path
    const state = appState.get();
    let transcriptPath: string | undefined;
    for (const sessions of Object.values(state.historySessions)) {
      const found = sessions.find((s) => sessionIdsMatch(s.sessionId, canonicalSessionId));
      if (found) {
        transcriptPath = found.transcriptPath;
        break;
      }
    }
    const messages: TranscriptMessage[] = await (rpc as any).request.getTranscript({
      sessionId: canonicalSessionId,
      transcriptPath,
    });
    if (loadSeq !== transcriptLoadSeq) return;
    const latestActiveSessionId = resolveCanonicalSessionId(appState.get().activeSessionId);
    if (!sessionIdsMatch(latestActiveSessionId, canonicalSessionId)) return;
    chatView.renderTranscript(messages);
  } catch (err) {
    if (loadSeq !== transcriptLoadSeq) return;
    const latestActiveSessionId = resolveCanonicalSessionId(appState.get().activeSessionId);
    if (!sessionIdsMatch(latestActiveSessionId, canonicalSessionId)) return;
    console.error("Failed to load transcript:", err);
    chatView.clear();
  }
}

async function loadSessionHistory(cwd: string): Promise<void> {
  try {
    const history: HistorySession[] = await (rpc as any).request.getSessionHistory({ cwd });
    appState.update((s) => ({
      ...s,
      historySessions: { ...s.historySessions, [cwd]: history },
    }));
  } catch (err) {
    console.error("Failed to load session history:", err);
  }
}

async function loadBranchHistory(cwd: string, force = false): Promise<void> {
  if (!cwd) return;

  const state = appState.get();
  const alreadyLoaded = state.loadedBranchHistory.has(cwd);
  if (!force && alreadyLoaded) return;

  try {
    const [commits, vcsInfo]: [BranchCommit[], VcsInfo] = await Promise.all([
      (rpc as any).request.getBranchHistory({ cwd, limit: 120 }),
      (rpc as any).request.getVcsInfo({ cwd }),
    ]);
    appState.update((s) => {
      const loaded = new Set(s.loadedBranchHistory);
      loaded.add(cwd);
      return {
        ...s,
        branchHistory: {
          ...s.branchHistory,
          [cwd]: commits,
        },
        vcsInfoByStage: {
          ...s.vcsInfoByStage,
          [cwd]: vcsInfo,
        },
        loadedBranchHistory: loaded,
      };
    });
  } catch (err) {
    console.error("Failed to load branch history:", err);
    appState.update((s) => {
      const loaded = new Set(s.loadedBranchHistory);
      loaded.add(cwd);
      return {
        ...s,
        branchHistory: {
          ...s.branchHistory,
          [cwd]: [],
        },
        loadedBranchHistory: loaded,
      };
    });
  }
}

function ensureBranchHistory(cwd: string): void {
  void loadBranchHistory(cwd, false);
}

async function loadCommitContext(cwd: string): Promise<void> {
  if (!cwd) return;
  try {
    const context: CommitContext = await (rpc as any).request.getCommitContext({ cwd });
    appState.update((s) => ({
      ...s,
      commitContextByStage: {
        ...s.commitContextByStage,
        [cwd]: context,
      },
    }));
  } catch (err) {
    console.error("Failed to load commit context:", err);
    appState.update((s) => ({
      ...s,
      commitContextByStage: {
        ...s.commitContextByStage,
        [cwd]: emptyCommitContext(),
      },
    }));
  }
}

function scheduleCommitContextRefresh(cwd: string, delayMs: number): void {
  if (commitContextRefreshTimer) {
    clearTimeout(commitContextRefreshTimer);
  }
  commitContextRefreshTimer = setTimeout(() => {
    commitContextRefreshTimer = null;
    void loadCommitContext(cwd);
  }, delayMs);
}

function syncCommitButtonVisibility(state: AppState): void {
  const activeStage = state.activeStage;
  const commitContext = activeStage
    ? state.commitContextByStage[activeStage]
    : null;
  const visible = state.viewMode === "stages"
    && Boolean(activeStage)
    && Boolean(commitContext?.hasChanges);
  diffView.setCommitButtonVisible(visible);
}

async function openCommitDialogForStage(): Promise<void> {
  const state = appState.get();
  const cwd = state.activeStage;
  if (!cwd || state.viewMode !== "stages") return;

  await loadCommitContext(cwd);
  const commitContext = appState.get().commitContextByStage[cwd];
  if (!commitContext?.hasChanges) {
    syncCommitButtonVisibility(appState.get());
    return;
  }

  commitModal.open({
    context: commitContext,
    onGenerate: async (includeUnstaged) => {
      const response: { message: string } = await (rpc as any).request.generateCommitMessage({
        cwd,
        includeUnstaged,
      });
      return response.message ?? "";
    },
    onSubmit: async ({ message, includeUnstaged, mode }) => {
      try {
        const result = await (rpc as any).request.performCommit({
          cwd,
          message,
          includeUnstaged,
          mode,
        });
        await refreshStageAfterCommit(cwd);
        return result;
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        if (/^Commit [0-9a-f]{4,}/i.test(text)) {
          await refreshStageAfterCommit(cwd);
        }
        throw err;
      }
    },
  });
}

async function refreshStageAfterCommit(cwd: string): Promise<void> {
  const state = appState.get();
  const activeStage = state.activeStage;
  const isStageVisible = state.viewMode === "stages" && activeStage === cwd;

  if (isStageVisible) {
    await loadDiff(cwd, state.diffScope);
  } else {
    await loadCommitContext(cwd);
  }
  await loadBranchHistory(cwd, true);
}

function clearCommitDiffSelection(cwd: string): void {
  if (!activeCommitDiff || activeCommitDiff.cwd !== cwd) return;
  activeCommitDiff = null;

  const activeStage = appState.get().activeStage;
  if (activeStage === cwd) {
    branchPanel.setActiveCommit(null);
  }
}

function applyDiffFiles(files: DiffFile[]): void {
  filesPanel.render(files);
  if (files.length > 0) {
    const state = appState.get();
    const isPRMode = state.viewMode === "prs";
    const reviewThreads = isPRMode
      ? resolveSelectedPullRequestThreads(state)
      : [];
    const reviewMap = isPRMode
      ? resolveSelectedPullRequestReviewMap(state)
      : null;
    diffView.setReviewThreads(reviewThreads);
    const firstUnseenPath = reviewMap
      ? (files.find((file) => !reviewMap.get(file.path)?.seen)?.path ?? null)
      : null;
    const activePath = isPRMode ? firstUnseenPath : files[0].path;
    filesPanel.setActiveFile(activePath);
    diffView.setFiles(files, {
      activeFile: activePath,
      scrollToActive: false,
    });
  } else {
    diffView.clear();
  }
}

async function loadDiff(cwd: string, scope?: DiffScope): Promise<void> {
  clearCommitDiffSelection(cwd);

  try {
    const state = appState.get();
    const selectedScope = scope ?? state.diffScope;
    const activeSessionId = resolveCanonicalSessionId(state.activeSessionId);
    const sessionId = selectedScope === "last_turn"
      && state.activeStage === cwd
      ? (activeSessionId ?? undefined)
      : undefined;
    filesPanel.setScope(selectedScope);
    const files: DiffFile[] = await (rpc as any).request.getDiff({
      cwd,
      scope: selectedScope,
      sessionId,
    });
    applyDiffFiles(files);
  } catch (err) {
    console.error("Failed to load diff:", err);
    filesPanel.clear();
    diffView.clear();
  } finally {
    void loadCommitContext(cwd);
  }
}

async function loadCommitDiff(cwd: string, commitHash: string): Promise<void> {
  try {
    const files: DiffFile[] = await (rpc as any).request.getCommitDiff({
      cwd,
      commitHash,
    });
    applyDiffFiles(files);
  } catch (err) {
    console.error("Failed to load commit diff:", err);
    filesPanel.clear();
    diffView.clear();
  } finally {
    void loadCommitContext(cwd);
  }
}

function scheduleDiffRefresh(
  cwd: string,
  scope: DiffScope,
  delayMs: number
): void {
  if (diffRefreshTimer) {
    clearTimeout(diffRefreshTimer);
  }
  diffRefreshTimer = setTimeout(() => {
    diffRefreshTimer = null;
    void loadDiff(cwd, scope);
  }, delayMs);
}

function scheduleBranchHistoryRefresh(cwd: string, delayMs: number): void {
  if (branchHistoryRefreshTimer) {
    clearTimeout(branchHistoryRefreshTimer);
  }
  branchHistoryRefreshTimer = setTimeout(() => {
    branchHistoryRefreshTimer = null;
    void loadBranchHistory(cwd, true);
  }, delayMs);
}

function syncConnectorAuthPollTimer(state: AppState): void {
  const auth = state.connectorAuthSession;
  if (!auth || auth.status !== "pending") {
    if (connectorAuthPollTimer) {
      clearTimeout(connectorAuthPollTimer);
      connectorAuthPollTimer = null;
    }
    return;
  }

  if (connectorAuthPollTimer) return;
  connectorAuthPollTimer = setTimeout(() => {
    connectorAuthPollTimer = null;
    void pollConnectorAuthStatus();
  }, 900);
}

async function pollConnectorAuthStatus(): Promise<void> {
  const current = appState.get().connectorAuthSession;
  if (!current || current.status !== "pending") return;

  try {
    const next: ConnectorAuthSession = await (rpc as any).request.getConnectorAuthStatus({
      authSessionId: current.id,
    });
    appState.update((s) => ({
      ...s,
      connectorAuthSession: next,
    }));
    if (next.status !== "pending") {
      await loadStageConnectors(next.stagePath, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appState.update((s) => ({
      ...s,
      connectorAuthSession: s.connectorAuthSession
        ? {
            ...s.connectorAuthSession,
            status: "failed",
            error: message || "Failed to read OAuth status",
            updatedAt: new Date().toISOString(),
          }
        : null,
    }));
  }

  syncConnectorAuthPollTimer(appState.get());
}

function isDiffMutationEvent(event: ClaudeStreamEvent): boolean {
  const ev = event as any;
  if (ev.type !== "user") return false;

  const toolResult = ev.tool_use_result;
  if (!toolResult || typeof toolResult !== "object") return false;

  const kind = String(toolResult.type ?? "").toLowerCase();
  if (kind === "create" || kind === "update" || kind === "delete" || kind === "rename") {
    return true;
  }

  const hasPatch = Array.isArray(toolResult.structuredPatch) && toolResult.structuredPatch.length > 0;
  return hasPatch;
}

function isStopHookEvent(event: ClaudeStreamEvent): boolean {
  const ev = event as any;
  if (ev.type !== "system") return false;

  const hookName = extractHookEventName(ev);
  return hookName.toLowerCase() === "stop";
}

function extractHookEventName(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return "";
    }
    try {
      return extractHookEventName(JSON.parse(trimmed), depth + 1);
    } catch {
      return "";
    }
  }

  if (typeof value !== "object") return "";

  const bag = value as Record<string, unknown>;
  const direct = bag.hook_event_name ?? bag.hookEventName;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const nested = [
    bag.hookSpecificOutput,
    bag.hook_specific_output,
    bag.payload,
    bag.data,
    bag.result,
    bag.output,
    bag.stdout,
    bag.message,
    bag.hook_response,
    bag.hookResponse,
  ];
  for (const entry of nested) {
    const name = extractHookEventName(entry, depth + 1);
    if (name) return name;
  }

  return "";
}

function emptyCommitContext(): CommitContext {
  return {
    branch: "(unknown)",
    hasChanges: false,
    stagedFiles: 0,
    stagedAdditions: 0,
    stagedDeletions: 0,
    unstagedFiles: 0,
    unstagedAdditions: 0,
    unstagedDeletions: 0,
    untrackedFiles: 0,
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
  };
}

async function loadStages(): Promise<void> {
  try {
    const stages: string[] = await (rpc as any).request.getStages({});
    const expanded = new Set<string>();
    // Auto-expand first stage
    if (stages.length > 0) {
      expanded.add(stages[0]);
    }
    appState.update((s) => ({
      ...s,
      stages,
      expandedStages: expanded,
      activeStage: stages[0] ?? null,
    }));
    // Auto-show stages panel if we have stages
    if (stages.length > 0) {
      panelLayout.showPanel("stages");
      qs("#btn-toggle-stages")?.classList.add("active");
      // Load diff and history for first stage
      loadDiff(stages[0], appState.get().diffScope);
      loadSessionHistory(stages[0]);
      loadStageConnectors(stages[0], false);
      for (const wsPath of stages) {
        ensureBranchHistory(wsPath);
      }
    }
  } catch {
    // First run — no stages yet
  }
}

async function loadSessionNames(): Promise<void> {
  try {
    const names: Record<string, string> = await (rpc as any).request.getSessionNames({});
    appState.update((s) => ({
      ...s,
      customSessionNames: names,
    }));
  } catch (err) {
    console.error("Failed to load session names:", err);
  }
}

async function loadPlugins(force = false): Promise<void> {
  const state = appState.get();
  if (state.pluginsLoading) return;
  if (!force && state.plugins.length > 0) return;

  appState.update((s) => ({
    ...s,
    pluginsLoading: true,
  }));

  try {
    const plugins: InstalledPlugin[] = await (rpc as any).request.getInstalledPlugins({});
    appState.update((s) => ({
      ...s,
      plugins,
      pluginsLoading: false,
      pluginSelection: resolvePluginSelection(plugins, s.pluginSelection),
    }));
  } catch (err) {
    console.error("Failed to load plugins:", err);
    appState.update((s) => ({
      ...s,
      pluginsLoading: false,
    }));
  }
}

async function loadInstruments(force = false): Promise<void> {
  const state = appState.get();
  if (state.instrumentsLoading && !force) return;

  appState.update((s) => ({
    ...s,
    instrumentsLoading: true,
    instrumentsError: null,
  }));

  try {
    const entries: InstrumentRegistryEntry[] = await (rpc as any).request.listInstruments({});
    const prevActiveId = appState.get().activeInstrumentId;
    const nextActiveId = entries.some((entry) => entry.id === prevActiveId)
      ? prevActiveId
      : (entries.find((entry) => entry.id === TASKS_INSTRUMENT_ID)?.id ?? null);

    appState.update((s) => ({
      ...s,
      instrumentEntries: entries,
      activeInstrumentId: nextActiveId,
      instrumentsLoading: false,
      instrumentsError: null,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to load instruments:", err);
    appState.update((s) => ({
      ...s,
      instrumentsLoading: false,
      instrumentsError: message,
    }));
  }
}

async function activateInstrument(instrumentId: string): Promise<void> {
  const id = String(instrumentId ?? "").trim();
  if (!id) return;

  const entry = appState.get().instrumentEntries.find((item) => item.id === id) ?? null;
  if (!entry) return;

  appState.update((s) => ({
    ...s,
    activeInstrumentId: id,
    instrumentsError: null,
  }));

  if (!entry.enabled || entry.status === "disabled") {
    appState.update((s) => ({
      ...s,
      viewMode: "instruments",
      instrumentsError: `Instrument '${entry.name}' is disabled`,
    }));
    return;
  }

  if (entry.status === "blocked") {
    appState.update((s) => ({
      ...s,
      viewMode: "instruments",
      instrumentsError: entry.lastError || `Instrument '${entry.name}' is blocked`,
    }));
    return;
  }

  panelLayout.showPanel("stages");
  qs("#btn-toggle-stages")?.classList.add("active");

  if (id === TASKS_INSTRUMENT_ID) {
    await deactivateRuntimeInstrument();
    appState.update((s) => ({ ...s, viewMode: "tasks" }));
    await loadAllStageTasks();
    return;
  }

  try {
    await activateRuntimeInstrument(entry);
    appState.update((s) => ({
      ...s,
      viewMode: "instruments",
      instrumentsError: null,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deactivateRuntimeInstrument();
    appState.update((s) => ({
      ...s,
      viewMode: "instruments",
      instrumentsError: `Failed to activate '${entry.name}': ${message}`,
    }));
  }
}

async function installInstrumentFromLocalPath(): Promise<void> {
  try {
    const path: string | null = await (rpc as any).request.pickDirectory({});
    if (!path) return;

    await (rpc as any).request.installInstrumentFromPath({ path });
    await loadInstruments(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to install local instrument:", err);
    appState.update((s) => ({
      ...s,
      instrumentsError: message,
    }));
  }
}

async function setInstrumentEnabled(instrumentId: string, enabled: boolean): Promise<void> {
  try {
    await (rpc as any).request.setInstrumentEnabled({ instrumentId, enabled });
    await loadInstruments(true);

    if (!enabled) {
      const state = appState.get();
      if (state.activeInstrumentId === instrumentId) {
        await deactivateRuntimeInstrument();
        appState.update((s) => ({
          ...s,
          viewMode: state.viewMode === "tasks" ? "instruments" : state.viewMode,
        }));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to toggle instrument:", err);
    appState.update((s) => ({
      ...s,
      instrumentsError: message,
    }));
  }
}

async function removeLocalInstrument(instrumentId: string): Promise<void> {
  const entry = appState.get().instrumentEntries.find((item) => item.id === instrumentId) ?? null;
  if (!entry) return;
  if (entry.isBundled) {
    appState.update((s) => ({
      ...s,
      instrumentsError: `Bundled instrument '${entry.name}' cannot be uninstalled`,
    }));
    return;
  }

  try {
    if (activeRuntimeInstrumentId === instrumentId) {
      await deactivateRuntimeInstrument();
    }
    await (rpc as any).request.removeInstrument({
      instrumentId,
      deleteData: false,
    });
    await loadInstruments(true);
    appState.update((s) => ({
      ...s,
      activeInstrumentId: s.activeInstrumentId === instrumentId ? null : s.activeInstrumentId,
      viewMode: (s.viewMode === "tasks" || s.viewMode === "instruments")
        ? "stages"
        : s.viewMode,
      selectedTaskId: s.activeInstrumentId === instrumentId ? null : s.selectedTaskId,
      selectedTaskDetail: s.activeInstrumentId === instrumentId ? null : s.selectedTaskDetail,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to uninstall instrument:", err);
    appState.update((s) => ({
      ...s,
      instrumentsError: message,
    }));
  }
}

async function retryBlockedInstrumentMigration(instrumentId: string): Promise<void> {
  try {
    const response: { result: { ok: boolean; blocked: boolean; error: string | null } }
      = await (rpc as any).request.instrumentInvoke({
        instrumentId,
        method: "retryMigration",
        params: {},
      });
    await loadInstruments(true);

    if (response.result.ok) {
      await activateInstrument(instrumentId);
      return;
    }

    appState.update((s) => ({
      ...s,
      instrumentsError: response.result.error ?? `Migration retry failed for '${instrumentId}'`,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to retry migration:", err);
    appState.update((s) => ({
      ...s,
      instrumentsError: message,
    }));
  }
}

async function handleInstrumentEvent(
  instrumentId: string,
  event: string,
  payload?: unknown
): Promise<void> {
  if (instrumentId !== TASKS_INSTRUMENT_ID || event !== "tasks.changed") {
    return;
  }

  const body = (payload ?? {}) as {
    stagePath?: string;
    taskId?: string | null;
  };
  const stagePath = String(body.stagePath ?? "").trim();
  if (!stagePath) return;
  await loadStageTasks(stagePath, true);

  const taskId = body.taskId ? String(body.taskId).trim() : "";
  if (!taskId) return;
  const state = appState.get();
  if (state.selectedTaskId === taskId) {
    await loadTaskDetail(taskId, true);
  }
}

async function loadStageConnectors(
  stagePath: string,
  force = false
): Promise<void> {
  if (!stagePath) return;
  const state = appState.get();
  const alreadyLoaded = Array.isArray(state.connectorsByStage[stagePath]);
  if (state.connectorsLoading && !force) return;
  if (alreadyLoaded && !force) return;

  appState.update((s) => ({
    ...s,
    connectorsLoading: true,
  }));

  try {
    const connectors: StageConnector[] = await (rpc as any).request.getStageConnectors({
      stagePath,
    });
    appState.update((s) => ({
      ...s,
      connectorsLoading: false,
      connectorsByStage: {
        ...s.connectorsByStage,
        [stagePath]: connectors,
      },
    }));
  } catch (err) {
    console.error("Failed to load stage connectors:", err);
    appState.update((s) => ({
      ...s,
      connectorsLoading: false,
    }));
  }
}

async function loadAllStageTasks(): Promise<void> {
  const state = appState.get();
  if (state.stages.length === 0) {
    appState.update((s) => ({
      ...s,
      tasksByStage: {},
      tasksLoading: false,
      selectedTaskId: null,
      selectedTaskDetail: null,
    }));
    return;
  }

  appState.update((s) => ({
    ...s,
    tasksLoading: true,
  }));

  try {
    const pairs = await Promise.all(state.stages.map(async (stagePath) => {
      const tasks = await invokeTasksInstrument<TaskCardSummary[]>("listStageTasks", { stagePath });
      return [stagePath, tasks] as const;
    }));

    const byStage: Record<string, TaskCardSummary[]> = {};
    for (const [stagePath, tasks] of pairs) {
      byStage[stagePath] = tasks;
    }

    let selectedTaskId = appState.get().selectedTaskId;
    if (!selectedTaskId || !findTaskSummaryById(byStage, selectedTaskId)) {
      const activeStage = appState.get().activeStage;
      const preferred = activeStage ? byStage[activeStage] : null;
      selectedTaskId = preferred?.[0]?.id ?? pairs[0]?.[1]?.[0]?.id ?? null;
    }

    appState.update((s) => ({
      ...s,
      tasksByStage: byStage,
      tasksLoading: false,
      selectedTaskId,
      selectedTaskDetail: selectedTaskId === s.selectedTaskDetail?.id ? s.selectedTaskDetail : null,
    }));

    if (selectedTaskId) {
      await loadTaskDetail(selectedTaskId, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to load tasks:", err);
    appState.update((s) => ({
      ...s,
      tasksLoading: false,
      viewMode: s.viewMode === "tasks" ? "instruments" : s.viewMode,
      instrumentsError: message,
    }));
  }
}

async function loadStageTasks(stagePath: string, refreshDetail = false): Promise<void> {
  if (!stagePath) return;
  try {
    const tasks = await invokeTasksInstrument<TaskCardSummary[]>("listStageTasks", { stagePath });
    appState.update((s) => ({
      ...s,
      tasksByStage: {
        ...s.tasksByStage,
        [stagePath]: tasks,
      },
    }));

    const selectedTaskId = appState.get().selectedTaskId;
    if (!selectedTaskId) return;
    const selectedStillExists = tasks.some((task) => task.id === selectedTaskId);
    if (refreshDetail && selectedStillExists) {
      await loadTaskDetail(selectedTaskId, true);
      return;
    }
    if (!selectedStillExists && appState.get().selectedTaskDetail?.stagePath === stagePath) {
      const next = tasks[0] ?? null;
      appState.update((s) => ({
        ...s,
        selectedTaskId: next?.id ?? null,
        selectedTaskDetail: next ? s.selectedTaskDetail : null,
      }));
      if (next) {
        await loadTaskDetail(next.id, true);
      } else {
        appState.update((s) => ({ ...s, selectedTaskDetail: null }));
      }
    }
  } catch (err) {
    console.error("Failed to load stage tasks:", err);
  }
}

async function loadTaskDetail(taskId: string, keepSelection = false): Promise<void> {
  if (!taskId) return;
  try {
    const detail = await invokeTasksInstrument<TaskCardDetail | null>("getTaskDetail", { taskId });
    if (!detail) {
      appState.update((s) => ({
        ...s,
        selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
        selectedTaskDetail: s.selectedTaskDetail?.id === taskId ? null : s.selectedTaskDetail,
      }));
      return;
    }

    appState.update((s) => ({
      ...s,
      selectedTaskId: keepSelection ? (s.selectedTaskId ?? detail.id) : detail.id,
      selectedTaskDetail: detail,
      activeStage: detail.stagePath,
    }));
  } catch (err) {
    console.error("Failed to load task detail:", err);
  }
}

async function loadPullRequests(force = false): Promise<void> {
  const state = appState.get();
  if (state.pullRequestsLoading && !force) return;

  appState.update((s) => ({
    ...s,
    pullRequestsLoading: true,
    pullRequestsError: null,
  }));

  try {
    const [assignedPullRequests, reviewRequestedPullRequests, openedPullRequests] = await Promise.all([
      (rpc as any).request.getAssignedPullRequests({
        limit: 120,
      }) as Promise<PullRequestSummary[]>,
      (rpc as any).request.getReviewRequestedPullRequests({
        limit: 120,
      }) as Promise<PullRequestSummary[]>,
      (rpc as any).request.getOpenedPullRequests({
        limit: 120,
      }) as Promise<PullRequestSummary[]>,
    ]);

    const allPullRequests = mergePullRequestLists(
      assignedPullRequests,
      reviewRequestedPullRequests,
      openedPullRequests
    );

    const currentSelection = appState.get().selectedPullRequest;
    const selectedExists = currentSelection
      ? allPullRequests.some((pr) => pr.repo === currentSelection.repo && pr.number === currentSelection.number)
      : false;
    const nextSelection = selectedExists ? currentSelection : null;

    appState.update((s) => {
      const selectionChanged = !isSamePullRequestSelection(s.selectedPullRequest, nextSelection);
      if (selectionChanged) {
        cachedPullRequestDiff = null;
      }
      return {
        ...s,
        assignedPullRequests,
        reviewRequestedPullRequests,
        openedPullRequests,
        pullRequestsLoading: false,
        pullRequestsError: null,
        pullRequestsFetchedAt: Date.now(),
        selectedPullRequest: nextSelection,
        selectedPullRequestCommitSha: selectionChanged ? null : s.selectedPullRequestCommitSha,
        selectedPullRequestDetail: selectionChanged ? null : s.selectedPullRequestDetail,
        pullRequestReviewState: selectionChanged ? null : s.pullRequestReviewState,
        pullRequestAgentReviews: selectionChanged ? [] : s.pullRequestAgentReviews,
        pullRequestAgentReviewsError: selectionChanged ? null : s.pullRequestAgentReviewsError,
        pullRequestAgentReviewsLoading: selectionChanged ? false : s.pullRequestAgentReviewsLoading,
        selectedPullRequestAgentReviewVersion: selectionChanged
          ? null
          : s.selectedPullRequestAgentReviewVersion,
        selectedPullRequestAgentReviewDocument: selectionChanged
          ? null
          : s.selectedPullRequestAgentReviewDocument,
        pullRequestAgentReviewStarting: selectionChanged
          ? false
          : s.pullRequestAgentReviewStarting,
      };
    });

    if (!nextSelection) {
      if (appState.get().viewMode === "prs") {
        diffView.clear();
        filesPanel.clear();
      }
      return;
    }

    const nextState = appState.get();
    const loadedSelection = nextState.selectedPullRequestDetail;
    const shouldLoadDetail = !loadedSelection
      || loadedSelection.repo !== nextSelection.repo
      || loadedSelection.number !== nextSelection.number;

    if (shouldLoadDetail) {
      await loadPullRequestDetail(nextSelection.repo, nextSelection.number, true);
    }
  } catch (err) {
    const message = formatPullRequestError(err);
    console.error("Failed to load pull requests:", err);
    appState.update((s) => ({
      ...s,
      pullRequestsLoading: false,
      pullRequestsError: message,
    }));
  }
}

async function loadPullRequestDetail(
  repo: string,
  number: number,
  keepSelection = false
): Promise<void> {
  appState.update((s) => ({
    ...s,
    selectedPullRequest: keepSelection ? s.selectedPullRequest : { repo, number },
    pullRequestDetailLoading: true,
    pullRequestDetailError: null,
    pullRequestAgentReviewsLoading: true,
    pullRequestAgentReviewsError: null,
  }));

  try {
    const [detail, reviewState] = await Promise.all([
      (rpc as any).request.getPullRequestDetail({ repo, number }),
      (rpc as any).request.getPullRequestReviewState({ repo, number }),
    ]) as [PullRequestDetail, PullRequestReviewState | null];

    let agentReviews: PullRequestAgentReviewRun[] = [];
    let agentReviewsError: string | null = null;

    try {
      agentReviews = await (rpc as any).request.getPullRequestAgentReviews({
        repo,
        number,
      }) as PullRequestAgentReviewRun[];
      agentReviews.sort((left, right) => left.version - right.version);
    } catch (error) {
      agentReviewsError = formatPullRequestError(error);
    }

    const currentState = appState.get();
    const selectedAgentReviewVersion = resolvePreferredAgentReviewVersion(
      agentReviews,
      currentState.selectedPullRequestAgentReviewVersion
    );

    let selectedAgentReviewDocument: PullRequestAgentReviewDocument | null = null;
    if (selectedAgentReviewVersion != null && agentReviewsError == null) {
      try {
        selectedAgentReviewDocument = await (rpc as any).request.getPullRequestAgentReviewDocument({
          repo,
          number,
          version: selectedAgentReviewVersion,
        }) as PullRequestAgentReviewDocument | null;
      } catch (error) {
        agentReviewsError = formatPullRequestError(error);
      }
    }

    appState.update((s) => {
      const existingCommitSha = s.selectedPullRequestCommitSha;
      const commitStillExists = existingCommitSha
        ? detail.commits.some((commit) => commit.sha === existingCommitSha)
        : false;
      return {
        ...s,
        selectedPullRequest: { repo, number },
        selectedPullRequestDetail: detail,
        pullRequestReviewState: reviewState,
        selectedPullRequestCommitSha: commitStillExists ? existingCommitSha : null,
        pullRequestDetailLoading: false,
        pullRequestDetailError: null,
        pullRequestAgentReviews: agentReviews,
        pullRequestAgentReviewsLoading: false,
        pullRequestAgentReviewsError: agentReviewsError,
        selectedPullRequestAgentReviewVersion: selectedAgentReviewVersion,
        selectedPullRequestAgentReviewDocument: selectedAgentReviewDocument,
      };
    });

    await loadSelectedPullRequestDiff();
  } catch (err) {
    const message = formatPullRequestError(err);
    console.error("Failed to load pull request detail:", err);
    appState.update((s) => ({
      ...s,
      pullRequestDetailLoading: false,
      pullRequestDetailError: message,
      selectedPullRequestDetail: null,
      pullRequestReviewState: null,
      pullRequestAgentReviews: [],
      pullRequestAgentReviewsLoading: false,
      pullRequestAgentReviewsError: null,
      selectedPullRequestAgentReviewVersion: null,
      selectedPullRequestAgentReviewDocument: null,
      pullRequestAgentReviewStarting: false,
    }));
    diffView.clear();
    filesPanel.clear();
  }
}

async function loadSelectedPullRequestDiff(): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) {
    cachedPullRequestDiff = null;
    diffView.clear();
    filesPanel.clear();
    return;
  }

  try {
    const files: DiffFile[] = await (rpc as any).request.getPullRequestDiff({
      repo: selection.repo,
      number: selection.number,
      commitSha: state.selectedPullRequestCommitSha ?? null,
    });
    cachedPullRequestDiff = {
      repo: selection.repo,
      number: selection.number,
      commitSha: state.selectedPullRequestCommitSha ?? null,
      files,
      loadedAt: Date.now(),
    };
    applyDiffFiles(files);
  } catch (err) {
    console.error("Failed to load pull request diff:", err);
    cachedPullRequestDiff = null;
    filesPanel.clear();
    diffView.clear();
  }
}

async function refreshPullRequestAgentReviews(
  repo: string,
  number: number,
  preferredVersion?: number | null
): Promise<void> {
  appState.update((s) => ({
    ...s,
    pullRequestAgentReviewsLoading: true,
    pullRequestAgentReviewsError: null,
  }));

  try {
    const runs = await (rpc as any).request.getPullRequestAgentReviews({
      repo,
      number,
    }) as PullRequestAgentReviewRun[];
    runs.sort((left, right) => left.version - right.version);

    const currentState = appState.get();
    const selectedVersion = resolvePreferredAgentReviewVersion(
      runs,
      preferredVersion ?? currentState.selectedPullRequestAgentReviewVersion
    );

    let selectedDocument: PullRequestAgentReviewDocument | null = null;
    if (selectedVersion != null) {
      selectedDocument = await (rpc as any).request.getPullRequestAgentReviewDocument({
        repo,
        number,
        version: selectedVersion,
      }) as PullRequestAgentReviewDocument | null;
    }

    const selection = appState.get().selectedPullRequest;
    if (!selection || selection.repo !== repo || selection.number !== number) {
      return;
    }

    appState.update((s) => ({
      ...s,
      pullRequestAgentReviews: runs,
      pullRequestAgentReviewsLoading: false,
      pullRequestAgentReviewsError: null,
      selectedPullRequestAgentReviewVersion: selectedVersion,
      selectedPullRequestAgentReviewDocument: selectedDocument,
    }));
  } catch (error) {
    const message = formatPullRequestError(error);
    const selection = appState.get().selectedPullRequest;
    if (!selection || selection.repo !== repo || selection.number !== number) {
      return;
    }
    appState.update((s) => ({
      ...s,
      pullRequestAgentReviewsLoading: false,
      pullRequestAgentReviewsError: message,
      selectedPullRequestAgentReviewDocument: null,
    }));
  }
}

async function selectPullRequestAgentReviewVersion(version: number): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  if (!selection) return;

  const normalized = Math.max(1, Math.trunc(version));
  appState.update((s) => ({
    ...s,
    selectedPullRequestAgentReviewVersion: normalized,
    pullRequestAgentReviewsLoading: true,
    pullRequestAgentReviewsError: null,
  }));

  try {
    const document = await (rpc as any).request.getPullRequestAgentReviewDocument({
      repo: selection.repo,
      number: selection.number,
      version: normalized,
    }) as PullRequestAgentReviewDocument | null;
    const latestSelection = appState.get().selectedPullRequest;
    if (!latestSelection
      || latestSelection.repo !== selection.repo
      || latestSelection.number !== selection.number) {
      return;
    }

    appState.update((s) => ({
      ...s,
      selectedPullRequestAgentReviewDocument: document,
      pullRequestAgentReviewsLoading: false,
      pullRequestAgentReviewsError: null,
    }));
  } catch (error) {
    const message = formatPullRequestError(error);
    const latestSelection = appState.get().selectedPullRequest;
    if (!latestSelection
      || latestSelection.repo !== selection.repo
      || latestSelection.number !== selection.number) {
      return;
    }

    appState.update((s) => ({
      ...s,
      pullRequestAgentReviewsLoading: false,
      pullRequestAgentReviewsError: message,
      selectedPullRequestAgentReviewDocument: null,
    }));
  }
}

async function startPullRequestAgentReview(): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) return;
  if (state.pullRequestAgentReviewStarting) return;
  if (state.pullRequestAgentReviews.some((run) => run.status === "running")) return;

  appState.update((s) => ({
    ...s,
    pullRequestAgentReviewStarting: true,
    pullRequestAgentReviewsError: null,
  }));

  try {
    const run = await (rpc as any).request.startPullRequestAgentReview({
      repo: selection.repo,
      number: selection.number,
      headSha: detail.headSha,
    }) as PullRequestAgentReviewRun;

    await refreshPullRequestAgentReviews(selection.repo, selection.number, run.version);
  } catch (error) {
    const message = formatPullRequestError(error);
    const latestSelection = appState.get().selectedPullRequest;
    if (!latestSelection
      || latestSelection.repo !== selection.repo
      || latestSelection.number !== selection.number) {
      return;
    }
    appState.update((s) => ({
      ...s,
      pullRequestAgentReviewsError: message,
    }));
  } finally {
    const latestSelection = appState.get().selectedPullRequest;
    if (!latestSelection
      || latestSelection.repo !== selection.repo
      || latestSelection.number !== selection.number) {
      return;
    }
    appState.update((s) => ({
      ...s,
      pullRequestAgentReviewStarting: false,
    }));
  }
}

async function applyPullRequestAgentReviewIssue(params: {
  reviewVersion: number;
  suggestionIndex: number;
}): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  if (!selection) {
    throw new Error("No pull request selected");
  }

  try {
    await (rpc as any).request.applyPullRequestAgentReviewIssue({
      repo: selection.repo,
      number: selection.number,
      reviewVersion: Math.max(1, Math.trunc(params.reviewVersion)),
      suggestionIndex: Math.max(0, Math.trunc(params.suggestionIndex)),
    });
  } catch (error) {
    throw new Error(formatPullRequestError(error));
  }
}

async function handlePullRequestAgentReviewChangedMessage(
  repo: string,
  number: number
): Promise<void> {
  const selection = appState.get().selectedPullRequest;
  if (!selection || selection.repo !== repo || selection.number !== number) {
    return;
  }

  await refreshPullRequestAgentReviews(
    repo,
    number,
    appState.get().selectedPullRequestAgentReviewVersion
  );
}

async function setPullRequestFileSeen(path: string, seen: boolean): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) return;

  const fileMeta = detail.files.find((file) => file.path === path) ?? null;

  try {
    const nextReviewState: PullRequestReviewState = await (rpc as any).request.setPullRequestFileSeen({
      repo: selection.repo,
      number: selection.number,
      headSha: detail.headSha,
      filePath: path,
      fileSha: fileMeta?.sha ?? null,
      seen,
    });
    appState.update((s) => ({
      ...s,
      pullRequestReviewState: nextReviewState,
    }));
  } catch (err) {
    console.error("Failed to update pull request review state:", err);
  }
}

async function replyPullRequestReviewThread(
  thread: PullRequestReviewThread,
  body: string
): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) {
    throw new Error("No pull request selected");
  }

  const rootCommentId = resolveReviewThreadRootCommentId(thread);
  if (!rootCommentId) {
    throw new Error("Could not identify the review thread root comment");
  }

  try {
    await (rpc as any).request.replyPullRequestReviewComment({
      repo: selection.repo,
      number: selection.number,
      commentId: rootCommentId,
      body,
    });
  } catch (err) {
    throw new Error(formatPullRequestError(err));
  }

  await loadPullRequestDetail(selection.repo, selection.number, true);
}

async function createPullRequestReviewComment(params: {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
}): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) {
    throw new Error("No pull request selected");
  }

  const commitSha = (state.selectedPullRequestCommitSha ?? detail.headSha ?? "").trim();
  if (!commitSha) {
    throw new Error("Could not resolve pull request commit SHA");
  }

  try {
    await (rpc as any).request.createPullRequestReviewComment({
      repo: selection.repo,
      number: selection.number,
      commitSha,
      path: params.path,
      line: Math.max(1, Math.trunc(params.line)),
      side: params.side,
      body: params.body,
    });
  } catch (err) {
    throw new Error(formatPullRequestError(err));
  }

  await loadPullRequestDetail(selection.repo, selection.number, true);
}

async function markAllPullRequestFilesSeen(): Promise<void> {
  const state = appState.get();
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  if (!selection || !detail) return;

  try {
    const nextReviewState: PullRequestReviewState = await (rpc as any).request.markPullRequestFilesSeen({
      repo: selection.repo,
      number: selection.number,
      headSha: detail.headSha,
      files: detail.files.map((file) => ({
        path: file.path,
        sha: file.sha,
      })),
    });
    appState.update((s) => ({
      ...s,
      pullRequestReviewState: nextReviewState,
    }));
  } catch (err) {
    console.error("Failed to mark pull request files as seen:", err);
  }
}

async function refreshPullRequests(): Promise<void> {
  const currentState = appState.get();
  if (currentState.pullRequestsLoading || currentState.pullRequestDetailLoading) return;

  await loadPullRequests(true);
  const selection = appState.get().selectedPullRequest;
  if (!selection) return;
  await loadPullRequestDetail(selection.repo, selection.number, true);
}

async function enterPullRequestsMode(): Promise<void> {
  appState.update((s) => ({ ...s, viewMode: "prs" }));
  panelLayout.showPanel("stages");
  qs("#btn-toggle-stages")?.classList.add("active");

  const state = appState.get();
  if (state.pullRequestsLoading || state.pullRequestDetailLoading) return;

  if (isPullRequestCacheExpired(state)) {
    await refreshPullRequests();
    return;
  }

  if (state.selectedPullRequest && state.selectedPullRequestDetail) {
    if (!applyCachedSelectedPullRequestDiff(state)) {
      await loadSelectedPullRequestDiff();
    }
    return;
  }

  if (state.selectedPullRequest) {
    await loadPullRequestDetail(state.selectedPullRequest.repo, state.selectedPullRequest.number, true);
  }
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    await (rpc as any).request.openExternalUrl({ url });
  } catch (err) {
    console.error("Failed to open external URL:", err);
  }
}

function isPullRequestCacheExpired(state: AppState): boolean {
  if (state.pullRequestsFetchedAt == null) return true;
  return (Date.now() - state.pullRequestsFetchedAt) >= PULL_REQUEST_CACHE_TTL_MS;
}

function applyCachedSelectedPullRequestDiff(state: AppState): boolean {
  const selection = state.selectedPullRequest;
  const detail = state.selectedPullRequestDetail;
  const commitSha = state.selectedPullRequestCommitSha ?? null;
  if (!selection || !detail || !cachedPullRequestDiff) return false;
  if (cachedPullRequestDiff.repo !== selection.repo) return false;
  if (cachedPullRequestDiff.number !== selection.number) return false;
  if (cachedPullRequestDiff.commitSha !== commitSha) return false;
  applyDiffFiles(cachedPullRequestDiff.files);
  return true;
}

async function createTaskInStage(stagePath: string): Promise<void> {
  try {
    const detail = await invokeTasksInstrument<TaskCardDetail>("createTask", {
      stagePath,
      title: "Untitled task",
      notes: "",
    });

    appState.update((s) => ({
      ...s,
      selectedTaskId: detail.id,
      selectedTaskDetail: detail,
      activeStage: stagePath,
      activeInstrumentId: TASKS_INSTRUMENT_ID,
      viewMode: "tasks",
    }));

    await loadStageTasks(stagePath, false);
    await loadTaskDetail(detail.id, true);
  } catch (err) {
    console.error("Failed to create task:", err);
  }
}

async function openStage(): Promise<void> {
  try {
    const dir: string | null = await (rpc as any).request.pickDirectory({});
    if (!dir) return;

    await (rpc as any).request.addStage({ path: dir });
    const state = appState.get();
    const expanded = new Set(state.expandedStages);
    expanded.add(dir);

    appState.update((s) => ({
      ...s,
      stages: [dir, ...s.stages.filter((w) => w !== dir)],
      expandedStages: expanded,
      activeStage: dir,
    }));

    panelLayout.showPanel("stages");
    qs("#btn-toggle-stages")?.classList.add("active");
    loadDiff(dir, appState.get().diffScope);
    loadSessionHistory(dir);
    ensureBranchHistory(dir);
    loadStageConnectors(dir, true);
  } catch (err) {
    console.error("Failed to pick directory:", err);
  }
}

async function removeStage(path: string): Promise<void> {
  try {
    await (rpc as any).request.removeStage({ path });
    stageFileCache.delete(path);
    slashCommandCache.delete(path);
    if (commitModal.isOpen && appState.get().activeStage === path) {
      commitModal.close();
    }
    if (activeCommitDiff?.cwd === path) {
      activeCommitDiff = null;
    }
    appState.update((s) => {
      const stages = s.stages.filter((w) => w !== path);
      const expanded = new Set(s.expandedStages);
      const loadedBranchHistory = new Set(s.loadedBranchHistory);
      expanded.delete(path);
      loadedBranchHistory.delete(path);
      const branchHistory = { ...s.branchHistory };
      const vcsInfoByStage = { ...s.vcsInfoByStage };
      const commitContextByStage = { ...s.commitContextByStage };
      const tasksByStage = { ...s.tasksByStage };
      const connectorsByStage = { ...s.connectorsByStage };
      delete branchHistory[path];
      delete vcsInfoByStage[path];
      delete commitContextByStage[path];
      delete tasksByStage[path];
      delete connectorsByStage[path];
      const selectedTaskRemoved = s.selectedTaskDetail?.stagePath === path;
      const authSessionRemoved = s.connectorAuthSession?.stagePath === path;
      return {
        ...s,
        stages,
        expandedStages: expanded,
        branchHistory,
        vcsInfoByStage,
        commitContextByStage,
        tasksByStage,
        connectorsByStage,
        loadedBranchHistory,
        selectedTaskId: selectedTaskRemoved ? null : s.selectedTaskId,
        selectedTaskDetail: selectedTaskRemoved ? null : s.selectedTaskDetail,
        connectorAuthSession: authSessionRemoved ? null : s.connectorAuthSession,
        activeStage: s.activeStage === path
          ? (stages[0] ?? null)
          : s.activeStage,
      };
    });

    const nextStage = appState.get().activeStage;
    if (nextStage) {
      ensureBranchHistory(nextStage);
      void loadStageConnectors(nextStage, false);
    }
    const state = appState.get();
    if (state.activeInstrumentId === TASKS_INSTRUMENT_ID || state.viewMode === "tasks") {
      void loadAllStageTasks();
    }
  } catch (err) {
    console.error("Failed to remove stage:", err);
  }
}

async function searchStageFiles(
  cwd: string,
  query: string,
  limit: number
): Promise<string[]> {
  const cached = stageFileCache.get(cwd);
  let files = cached?.files;
  const cacheAgeMs = cached ? Date.now() - cached.loadedAt : Number.POSITIVE_INFINITY;
  if (!files || cacheAgeMs > STAGE_FILE_CACHE_MS) {
    const loaded = await (rpc as any).request.getStageFiles({ cwd });
    files = Array.isArray(loaded) ? loaded : [];
    stageFileCache.set(cwd, { files, loadedAt: Date.now() });
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return files.slice(0, limit);
  }

  return files
    .map((path) => ({ path, score: scoreStageFile(path, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.path.localeCompare(b.path);
    })
    .slice(0, limit)
    .map((entry) => entry.path);
}

async function searchSlashCommands(
  cwd: string,
  query: string,
  limit: number
): Promise<SlashCommandEntry[]> {
  const cached = slashCommandCache.get(cwd);
  let commands = cached?.commands;
  const cacheAgeMs = cached ? Date.now() - cached.loadedAt : Number.POSITIVE_INFINITY;
  if (!commands || cacheAgeMs > SLASH_COMMAND_CACHE_MS) {
    const loaded = await (rpc as any).request.getSlashCommands({ cwd });
    commands = Array.isArray(loaded) ? loaded : [];
    slashCommandCache.set(cwd, {
      commands,
      loadedAt: Date.now(),
    });
  }

  const normalizedQuery = query.trim().replace(/^\/+/, "").toLowerCase();
  if (!normalizedQuery) {
    return commands
      .slice()
      .sort(compareSlashCommandEntries)
      .slice(0, limit);
  }

  return commands
    .map((command) => ({
      command,
      score: scoreSlashCommand(command, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return compareSlashCommandEntries(a.command, b.command);
    })
    .slice(0, limit)
    .map((entry) => entry.command);
}

function scoreStageFile(path: string, query: string): number {
  const normalizedPath = path.toLowerCase();
  const fileName = path.split("/").pop()?.toLowerCase() ?? normalizedPath;

  if (fileName === query) return 500;
  if (fileName.startsWith(query)) return 400 - Math.min(fileName.length, 200);
  if (normalizedPath.startsWith(query)) return 320 - Math.min(normalizedPath.length, 200);

  const nameIdx = fileName.indexOf(query);
  if (nameIdx >= 0) return 260 - Math.min(nameIdx, 120);

  const pathIdx = normalizedPath.indexOf(query);
  if (pathIdx >= 0) return 200 - Math.min(pathIdx, 120);

  return 0;
}

function scoreSlashCommand(command: SlashCommandEntry, query: string): number {
  const name = command.name.toLowerCase();
  const leaf = command.name.split("/").pop()?.toLowerCase() ?? name;
  const sourceBoost = command.source === "project" ? 35 : 0;

  if (name === query) return 500 + sourceBoost;
  if (leaf === query) return 470 + sourceBoost;
  if (name.startsWith(query)) return 420 + sourceBoost - Math.min(name.length, 180);
  if (leaf.startsWith(query)) return 390 + sourceBoost - Math.min(leaf.length, 180);

  const leafIndex = leaf.indexOf(query);
  if (leafIndex >= 0) return 290 + sourceBoost - Math.min(leafIndex, 120);

  const nameIndex = name.indexOf(query);
  if (nameIndex >= 0) return 230 + sourceBoost - Math.min(nameIndex, 120);

  return 0;
}

function compareSlashCommandEntries(a: SlashCommandEntry, b: SlashCommandEntry): number {
  if (a.source !== b.source) {
    return a.source === "project" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

function resolveActiveStageConnectors(state: AppState): StageConnector[] {
  if (!state.activeStage) return [];
  const loaded = state.connectorsByStage[state.activeStage];
  if (Array.isArray(loaded) && loaded.length > 0) {
    const withDefaults = [
      loaded.find((entry) => entry.provider === "slack")
        ?? defaultStageConnector(state.activeStage, "slack"),
      loaded.find((entry) => entry.provider === "jira")
        ?? defaultStageConnector(state.activeStage, "jira"),
    ];
    return withDefaults;
  }
  return [
    defaultStageConnector(state.activeStage, "slack"),
    defaultStageConnector(state.activeStage, "jira"),
  ];
}

function defaultStageConnector(
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

// ── Helpers ──────────────────────────────────────────────────────

function resolvePluginSelection(
  plugins: InstalledPlugin[],
  current: PluginSidebarSelection | null
): PluginSidebarSelection | null {
  if (plugins.length === 0) return null;
  if (!current) {
    return {
      kind: "plugin",
      pluginId: plugins[0].id,
    };
  }

  const plugin = plugins.find((entry) => entry.id === current.pluginId);
  if (!plugin) {
    return {
      kind: "plugin",
      pluginId: plugins[0].id,
    };
  }

  if (current.kind === "plugin") {
    return current;
  }

  const list = current.kind === "command"
    ? plugin.commands
    : current.kind === "agent"
      ? plugin.agents
      : plugin.skills;

  const found = list.some((item) => item.id === current.itemId);
  if (found) return current;

  return {
    kind: "plugin",
    pluginId: plugin.id,
  };
}

function buildTaskStageGroups(state: AppState): TaskStageGroup[] {
  return state.stages.map((stagePath) => {
    const vcsInfo = state.vcsInfoByStage[stagePath];
    const branch = vcsInfo?.branch
      ?? resolveStageBranchName(state.branchHistory[stagePath] ?? EMPTY_BRANCH_COMMITS);
    return {
      stagePath,
      stageName: stagePath.split("/").pop() ?? stagePath,
      branch,
      tasks: state.tasksByStage[stagePath] ?? [],
    };
  });
}

function findTaskSummaryById(
  byStage: Record<string, TaskCardSummary[]>,
  taskId: string
): TaskCardSummary | null {
  for (const tasks of Object.values(byStage)) {
    const found = tasks.find((task) => task.id === taskId);
    if (found) return found;
  }
  return null;
}

function buildPullRequestRepoGroups(
  pullRequests: PullRequestSummary[]
): PullRequestRepoGroup[] {
  const byRepo = new Map<string, PullRequestSummary[]>();

  for (const pullRequest of pullRequests) {
    const list = byRepo.get(pullRequest.repo) ?? [];
    list.push(pullRequest);
    byRepo.set(pullRequest.repo, list);
  }

  const groups: PullRequestRepoGroup[] = [];
  for (const [repo, prs] of byRepo) {
    prs.sort((a, b) => {
      const tsA = Date.parse(a.updatedAt);
      const tsB = Date.parse(b.updatedAt);
      if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsA !== tsB) {
        return tsB - tsA;
      }
      return a.number - b.number;
    });
    groups.push({ repo, prs });
  }

  groups.sort((a, b) => a.repo.localeCompare(b.repo));
  return groups;
}

function buildPullRequestSidebarSections(state: AppState): PullRequestSidebarSection[] {
  return [
    {
      id: "assigned_to_me",
      label: "Assigned to me",
      groups: buildPullRequestRepoGroups(state.assignedPullRequests),
      emptyLabel: "No assigned PRs",
    },
    {
      id: "review_requested",
      label: "Review requested",
      groups: buildPullRequestRepoGroups(state.reviewRequestedPullRequests),
      emptyLabel: "No review requests",
    },
    {
      id: "opened_by_me",
      label: "Opened by me",
      groups: buildPullRequestRepoGroups(state.openedPullRequests),
      emptyLabel: "No opened PRs",
    },
  ];
}

function mergePullRequestLists(...lists: PullRequestSummary[][]): PullRequestSummary[] {
  const byKey = new Map<string, PullRequestSummary>();
  for (const list of lists) {
    for (const pr of list) {
      byKey.set(`${pr.repo}#${pr.number}`, pr);
    }
  }
  return [...byKey.values()];
}

function resolvePreferredAgentReviewVersion(
  runs: PullRequestAgentReviewRun[],
  preferredVersion: number | null | undefined
): number | null {
  if (!Array.isArray(runs) || runs.length === 0) return null;

  if (preferredVersion != null) {
    const normalized = Math.max(1, Math.trunc(preferredVersion));
    if (runs.some((run) => run.version === normalized)) {
      return normalized;
    }
  }

  return runs[runs.length - 1]?.version ?? null;
}

function resolveSelectedPullRequestReviewMap(state: AppState) {
  if (!state.selectedPullRequestDetail) return new Map();
  return buildPullRequestFileReviewStateMap(
    state.selectedPullRequestDetail.files,
    state.pullRequestReviewState,
    state.selectedPullRequestDetail.headSha
  );
}

function setGlobalFilesListViewMode(mode: FileListView): void {
  const normalized: FileListView = mode === "tree" ? "tree" : "flat";
  if (appState.get().filesListViewMode === normalized) return;
  persistFilesListViewMode(normalized);
  appState.update((s) => ({
    ...s,
    filesListViewMode: normalized,
  }));
}

function resolveSelectedPullRequestThreads(state: AppState): PullRequestReviewThread[] {
  if (!state.selectedPullRequestDetail) return [];
  if (state.selectedPullRequestCommitSha) return [];
  return state.selectedPullRequestDetail.conversation.filter(
    (item): item is PullRequestReviewThread => item.kind === "review_thread"
  );
}

function isSamePullRequestSelection(
  left: { repo: string; number: number } | null,
  right: { repo: string; number: number } | null
): boolean {
  if (!left || !right) return left === right;
  return left.repo === right.repo && left.number === right.number;
}

function resolveReviewThreadRootCommentId(thread: PullRequestReviewThread): string | null {
  if (!Array.isArray(thread.comments) || thread.comments.length === 0) return null;
  const root = thread.comments.find((comment) => !comment.inReplyToId) ?? thread.comments[0];
  const id = Number(root?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return String(Math.trunc(id));
}

function formatPullRequestError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("gh executable")
    || normalized.includes("command not found")
    || normalized.includes("executable file not found")
  ) {
    return "GitHub CLI is not installed. Install `gh` and retry.";
  }

  if (
    normalized.includes("not logged in")
    || normalized.includes("gh auth login")
    || normalized.includes("requires authentication")
    || normalized.includes("bad credentials")
  ) {
    return "GitHub CLI is not authenticated. Run `gh auth login`.";
  }

  const firstLine = message.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (firstLine) return firstLine.trim();
  return "Failed to load pull request data";
}

function loadPersistedFilesListViewMode(): FileListView {
  try {
    const value = localStorage.getItem(FILES_LIST_VIEW_MODE_STORAGE_KEY);
    return value === "tree" ? "tree" : "flat";
  } catch {
    return "flat";
  }
}

function persistFilesListViewMode(mode: FileListView): void {
  try {
    localStorage.setItem(FILES_LIST_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // non-fatal
  }
}

function buildStageData(state: AppState): StageData[] {
  const liveSessions = state.snapshot
    ? buildSessionList(state.snapshot)
    : [];
  const normalizedLiveSessionIds = remapLiveSessionIds(state.liveSessions);

  return state.stages.map((wsPath) => {
    const name = wsPath.split("/").pop() ?? wsPath;
    const vcsInfo = state.vcsInfoByStage[wsPath];
    const branch = vcsInfo?.branch
      ?? resolveStageBranchName(state.branchHistory[wsPath] ?? EMPTY_BRANCH_COMMITS);
    // Live sessions for this stage
    const wsLive = liveSessions.filter((s) => s.cwd === wsPath);
    const liveIds = new Set(wsLive.map((s) => s.sessionId));

    // Historical sessions (exclude any that are already live)
    const history = (state.historySessions[wsPath] ?? [])
      .filter((h) => !liveIds.has(h.sessionId))
      .map(historyToSessionInfo);
    const historyIds = new Set(history.map((session) => session.sessionId));
    const optimistic = buildAppSpawnedSessionList(
      wsPath,
      liveIds,
      historyIds,
      normalizedLiveSessionIds
    );

    // Apply custom names to all sessions
    const allSessions = [...wsLive, ...optimistic, ...history].map((s) => ({
      ...s,
      topic: state.customSessionNames[s.sessionId] ?? s.topic,
    }));

    return {
      path: wsPath,
      name,
      branch,
      active: state.activeStage === wsPath,
      sessions: allSessions,
      expanded: state.expandedStages.has(wsPath),
    };
  });
}

function resolveStageBranchName(commits: BranchCommit[]): string | null {
  for (const commit of commits) {
    const headRef = commit.refs.find((ref) => ref.kind === "head");
    if (headRef?.name) return headRef.name;
  }

  for (const commit of commits) {
    const branchRef = commit.refs.find(
      (ref) => ref.kind === "branch" && ref.name !== "HEAD"
    );
    if (branchRef?.name) return branchRef.name;
  }

  for (const commit of commits) {
    const isDetachedHead = commit.refs.some((ref) => ref.name === "HEAD");
    if (isDetachedHead) return "detached HEAD";
  }

  return null;
}

/** Convert a HistorySession into a SessionInfo for the sidebar */
function historyToSessionInfo(h: HistorySession): SessionInfo {
  return {
    sessionId: h.sessionId,
    topic: h.topic,
    prompt: h.prompt,
    cwd: h.cwd,
    activity: "finished",
    model: h.model,
    contextPercentage: null,
    currentToolLabel: null,
    startedAt: h.startedAt ?? "",
    updatedAt: h.lastActiveAt ?? h.startedAt ?? "",
    isAppSpawned: false,
    transcriptPath: h.transcriptPath,
  };
}

function buildAppSpawnedSessionList(
  stagePath: string,
  liveIds: Set<string>,
  historyIds: Set<string>,
  stateLiveIds: Set<string>
): SessionInfo[] {
  const result: SessionInfo[] = [];
  const seen = new Set<string>();
  for (const [sessionId, meta] of appSpawnedSessions) {
    const canonicalSessionId = resolveCanonicalSessionId(sessionId) ?? sessionId;
    if (meta.cwd !== stagePath) continue;
    if (!stateLiveIds.has(sessionId) && !stateLiveIds.has(canonicalSessionId)) continue;
    if (
      liveIds.has(sessionId)
      || liveIds.has(canonicalSessionId)
      || historyIds.has(sessionId)
      || historyIds.has(canonicalSessionId)
      || seen.has(canonicalSessionId)
    ) {
      continue;
    }
    seen.add(canonicalSessionId);
    result.push({
      sessionId: canonicalSessionId,
      topic: meta.topic,
      prompt: null,
      cwd: meta.cwd,
      activity: "working",
      model: null,
      contextPercentage: null,
      currentToolLabel: null,
      startedAt: meta.startedAt,
      updatedAt: meta.updatedAt,
      isAppSpawned: true,
      transcriptPath: null,
    });
  }
  return result;
}

function registerAppSpawnedSession(
  sessionId: string,
  cwd: string,
  topic: string | null
): void {
  const normalizedId = resolveCanonicalSessionId(sessionId)
    ?? String(sessionId ?? "").trim();
  const normalizedCwd = String(cwd ?? "").trim();
  if (!normalizedId || !normalizedCwd) return;

  const now = new Date().toISOString();
  appSpawnedSessions.set(normalizedId, {
    cwd: normalizedCwd,
    topic: topic ? collapseWhitespace(topic) : null,
    startedAt: now,
    updatedAt: now,
  });
}

function remapAppSpawnedSession(tempId: string, realId: string): void {
  if (!appSpawnedSessions.has(tempId)) return;
  if (tempId === realId) return;
  const meta = appSpawnedSessions.get(tempId);
  if (!meta) return;
  appSpawnedSessions.delete(tempId);
  appSpawnedSessions.set(realId, {
    ...meta,
    updatedAt: new Date().toISOString(),
  });
}

function removeAppSpawnedSession(sessionId: string): void {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) return;
  const canonical = resolveCanonicalSessionId(normalized);
  appSpawnedSessions.delete(normalized);
  if (canonical && canonical !== normalized) {
    appSpawnedSessions.delete(canonical);
  }
}

function buildSessionList(snapshot: Snapshot): SessionInfo[] {
  const seen = new Set<string>();
  const result: SessionInfo[] = [];

  for (const task of snapshot.tasks) {
    if (seen.has(task.sessionId)) continue;
    seen.add(task.sessionId);

    let activity: Activity = "idle";
    if (task.endedAt || ["completed", "error", "cancelled"].includes(task.status)) {
      activity = "finished";
    } else if (task.status === "running") {
      activity = "working";
    } else if (task.status === "waiting_for_input") {
      activity = "waiting_for_input";
    } else if (task.status === "waiting") {
      activity = "waiting";
    }

    result.push({
      sessionId: task.sessionId,
      topic: task.topic,
      prompt: task.prompt,
      cwd: task.cwd,
      activity,
      model: task.model,
      contextPercentage: task.contextPercentage,
      currentToolLabel: task.currentToolLabel,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      isAppSpawned: false,
      transcriptPath: task.transcriptPath,
    });
  }

  return result;
}

function resolveActiveSessionTitle(state: AppState): string {
  const activeSessionId = resolveCanonicalSessionId(state.activeSessionId);
  if (!activeSessionId) return "New session";

  const custom = state.customSessionNames[activeSessionId]?.trim();
  if (custom) return custom;

  if (state.snapshot) {
    const live = buildSessionList(state.snapshot).find((s) => s.sessionId === activeSessionId);
    const liveTitle = resolvePromptTitle(live?.topic ?? null, live?.prompt ?? null);
    if (liveTitle) return liveTitle;
  }

  for (const sessions of Object.values(state.historySessions)) {
    const found = sessions.find((s) => s.sessionId === activeSessionId);
    if (!found) continue;
    const historyTitle = resolvePromptTitle(found.topic, found.prompt);
    if (historyTitle) return historyTitle;
    break;
  }

  return "Session";
}

function resolvePromptTitle(topic: string | null, prompt: string | null): string | null {
  const cleanTopic = collapseWhitespace(topic ?? "");
  if (cleanTopic) return cleanTopic;

  const command = extractCommandName(prompt ?? "");
  if (command) return command;

  const cleanPrompt = collapseWhitespace(
    String(prompt ?? "")
      .replace(/<attached_files>\s*[\s\S]*?<\/attached_files>/gi, "\n")
      .replace(/<command-message>\s*[\s\S]*?<\/command-message>/gi, "\n")
      .replace(/<command-name>\s*[\s\S]*?<\/command-name>/gi, "\n")
      .split("\n")
      .find((line) => collapseWhitespace(line).length > 0) ?? ""
  );
  return cleanPrompt || null;
}

function extractCommandName(prompt: string): string | null {
  const commandNameMatch = prompt.match(
    /<command-name>\s*([^<\n]+?)\s*<\/command-name>/i
  );
  if (commandNameMatch?.[1]) {
    return normalizeCommandName(commandNameMatch[1]);
  }

  const commandMessageMatch = prompt.match(
    /<command-message>\s*([\s\S]*?)\s*<\/command-message>/i
  );
  if (commandMessageMatch?.[1]) {
    return normalizeCommandName(commandMessageMatch[1]);
  }

  return null;
}

function normalizeCommandName(value: string): string | null {
  const normalized = collapseWhitespace(value);
  if (!normalized) return null;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function registerSessionAlias(tempId: string, realId: string): void {
  const temp = String(tempId ?? "").trim();
  const real = String(realId ?? "").trim();
  if (!temp || !real || temp === real) return;

  const canonicalReal = resolveCanonicalSessionId(real) ?? real;
  sessionIdAliases.set(temp, canonicalReal);

  for (const [key, value] of sessionIdAliases) {
    if (value === temp) {
      sessionIdAliases.set(key, canonicalReal);
    }
  }
}

function resolveCanonicalSessionId(sessionId: string | null | undefined): string | null {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) return null;

  let current = normalized;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const next = sessionIdAliases.get(current);
    if (!next || next === current) break;
    current = next;
  }

  return current;
}

function sessionIdsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftCanonical = resolveCanonicalSessionId(left);
  const rightCanonical = resolveCanonicalSessionId(right);
  return Boolean(leftCanonical && rightCanonical && leftCanonical === rightCanonical);
}

function remapLiveSessionIds(liveIds: Set<string>): Set<string> {
  const remapped = new Set<string>();
  for (const sessionId of liveIds) {
    const canonical = resolveCanonicalSessionId(sessionId) ?? sessionId;
    remapped.add(canonical);
  }
  return remapped;
}

function clearSessionAliasesFor(sessionId: string): void {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) return;
  const canonical = resolveCanonicalSessionId(normalized) ?? normalized;
  for (const [key, value] of sessionIdAliases) {
    if (key === normalized || key === canonical || value === normalized || value === canonical) {
      sessionIdAliases.delete(key);
    }
  }
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveActiveContextUsage(
  state: AppState
): {
  contextPercentage: number | null;
  model: string | null;
  activity: Activity | null;
  promptTokens: number | null;
} | null {
  const activeSessionId = resolveCanonicalSessionId(state.activeSessionId);
  if (!activeSessionId || !state.snapshot) return null;

  const live = buildSessionList(state.snapshot).find((s) => s.sessionId === activeSessionId);
  if (!live) return null;
  const estimate = sessionUsageEstimates.get(activeSessionId);

  return {
    contextPercentage: live.contextPercentage,
    model: live.model ?? estimate?.model ?? null,
    activity: live.activity,
    promptTokens: estimate?.promptTokens ?? null,
  };
}

function updateSessionUsageEstimate(sessionId: string, event: ClaudeStreamEvent): void {
  const ev = event as any;
  if (ev?.type === "system" && ev?.subtype === "init") {
    const model = typeof ev.model === "string" ? ev.model : null;
    const current = sessionUsageEstimates.get(sessionId);
    sessionUsageEstimates.set(sessionId, {
      promptTokens: current?.promptTokens ?? null,
      model: model ?? current?.model ?? null,
    });
    return;
  }

  if (ev?.type !== "assistant") return;

  const usage = ev?.message?.usage;
  const promptTokens = extractPromptTokenUsage(usage);
  const model = typeof ev?.message?.model === "string" ? ev.message.model : null;

  const current = sessionUsageEstimates.get(sessionId);
  sessionUsageEstimates.set(sessionId, {
    promptTokens: promptTokens ?? current?.promptTokens ?? null,
    model: model ?? current?.model ?? null,
  });
}

function extractPromptTokenUsage(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const bag = usage as Record<string, unknown>;
  const input = asFiniteNumber(bag.input_tokens ?? bag.inputTokens) ?? 0;
  const cacheRead = asFiniteNumber(
    bag.cache_read_input_tokens ?? bag.cacheReadInputTokens
  ) ?? 0;
  const cacheCreate = asFiniteNumber(
    bag.cache_creation_input_tokens ?? bag.cacheCreationInputTokens
  ) ?? 0;

  const total = input + cacheRead + cacheCreate;
  return total > 0 ? total : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ── Boot ─────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
