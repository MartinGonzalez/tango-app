import Electrobun, { Electroview } from "electrobun/view";
import { Store } from "./lib/state.ts";
import { h, qs } from "./lib/dom.ts";
import { pluginToolIcon } from "./lib/icons.ts";
import { PanelLayout } from "./components/panel-layout.ts";
import { Sidebar, type WorkspaceData } from "./components/sidebar.ts";
import {
  PluginsSidebar,
  type PluginSidebarSelection,
} from "./components/plugins-sidebar.ts";
import { PluginsPreview } from "./components/plugins-preview.ts";
import { ChatView } from "./components/chat-view.ts";
import { DiffView } from "./components/diff-view.ts";
import { FilesPanel } from "./components/files-panel.ts";
import { BranchPanel } from "./components/branch-panel.ts";
import type {
  SessionInfo,
  Snapshot,
  ClaudeStreamEvent,
  TranscriptMessage,
  DiffFile,
  DiffScope,
  BranchCommit,
  Activity,
  HistorySession,
  ToolApprovalRequest,
  SlashCommandEntry,
  InstalledPlugin,
} from "../shared/types.ts";

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
        const isResultEvent = (event as any).type === "result";
        const isStopHook = isStopHookEvent(event);
        const hasPinnedCommitDiff = activeCommitDiff
          ? activeCommitDiff.cwd === state.activeWorkspace
          : false;
        if (state.activeSessionId === sessionId && chatView) {
          chatView.appendStreamEvent(event);
        }
        if (
          state.activeSessionId === sessionId
          && state.activeWorkspace
          && !hasPinnedCommitDiff
          && (isResultEvent || isDiffMutationEvent(event))
        ) {
          workspaceFileCache.delete(state.activeWorkspace);
          scheduleDiffRefresh(
            state.activeWorkspace,
            state.diffScope,
            isResultEvent ? 0 : 120
          );
        }
        if (
          state.activeSessionId === sessionId
          && state.activeWorkspace
          && diffView?.isBranchPanelVisible
          && (isResultEvent || isStopHook)
        ) {
          scheduleBranchHistoryRefresh(
            state.activeWorkspace,
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
        const state = appState.get();
        const live = new Set(state.liveSessions);
        if (live.has(tempId)) {
          live.delete(tempId);
          live.add(realId);
        }
        const updates: Partial<AppState> = { liveSessions: live };
        if (state.activeSessionId === tempId) {
          updates.activeSessionId = realId;
        }
        appState.update((s) => ({ ...s, ...updates }));
      },
      toolApproval: (req: ToolApprovalRequest) => {
        console.log("[webview] Tool approval request:", req.toolName, req.toolUseId, req.sessionId);
        const state = appState.get();
        // Only show approval dialog if this tool belongs to the active session
        if (chatView && state.activeSessionId === req.sessionId) {
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
        const state = appState.get();
        const hasPinnedCommitDiff = activeCommitDiff
          ? activeCommitDiff.cwd === state.activeWorkspace
          : false;
        const live = new Set(state.liveSessions);
        live.delete(sessionId);
        appState.update((s) => ({ ...s, liveSessions: live }));
        // Refresh diff when a session ends (changes may have been made)
        if (state.activeWorkspace) {
          if (!hasPinnedCommitDiff) {
            loadDiff(state.activeWorkspace);
          }
          if (diffView.isBranchPanelVisible) {
            scheduleBranchHistoryRefresh(state.activeWorkspace, 0);
          }
        }
      },
    },
  },
});

// @ts-ignore - electrobun is used internally by the webview runtime
const _electrobun = new Electrobun.Electroview({ rpc });

// ── State ────────────────────────────────────────────────────────

type AppState = {
  snapshot: Snapshot | null;
  viewMode: "workspaces" | "plugins";
  workspaces: string[];
  expandedWorkspaces: Set<string>;
  activeWorkspace: string | null;
  activeSessionId: string | null;
  diffScope: DiffScope;
  branchHistory: Record<string, BranchCommit[]>; // workspace path → commit history
  loadedBranchHistory: Set<string>; // workspace paths that have fetched branch history
  historySessions: Record<string, HistorySession[]>; // workspace path → history
  liveSessions: Set<string>; // session IDs with running processes
  customSessionNames: Record<string, string>; // sessionId → custom name
  plugins: InstalledPlugin[];
  pluginsLoading: boolean;
  pluginSelection: PluginSidebarSelection | null;
};

type SessionUsageEstimate = {
  promptTokens: number | null;
  model: string | null;
};

const appState = new Store<AppState>({
  snapshot: null,
  viewMode: "workspaces",
  workspaces: [],
  expandedWorkspaces: new Set(),
  activeWorkspace: null,
  activeSessionId: null,
  diffScope: "last_turn",
  branchHistory: {},
  loadedBranchHistory: new Set(),
  historySessions: {},
  liveSessions: new Set(),
  customSessionNames: {},
  plugins: [],
  pluginsLoading: false,
  pluginSelection: null,
});

// ── Components ───────────────────────────────────────────────────

let panelLayout: PanelLayout;
let sidebar: Sidebar;
let pluginsSidebar: PluginsSidebar;
let pluginsPreview: PluginsPreview;
let chatView: ChatView;
let diffView: DiffView;
let filesPanel: FilesPanel;
let branchPanel: BranchPanel;
let sidebarPrimaryPluginsBtn: HTMLButtonElement | null = null;
let diffRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let branchHistoryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const WORKSPACE_FILE_CACHE_MS = 30_000;
const workspaceFileCache = new Map<string, {
  files: string[];
  loadedAt: number;
}>();
const SLASH_COMMAND_CACHE_MS = 15_000;
const slashCommandCache = new Map<string, {
  commands: SlashCommandEntry[];
  loadedAt: number;
}>();
const sessionUsageEstimates = new Map<string, SessionUsageEstimate>();
const EMPTY_BRANCH_COMMITS: BranchCommit[] = [];
let prevBranchWorkspace: string | null = null;
let prevBranchCommits: BranchCommit[] | null = null;
let activeCommitDiff: { cwd: string; hash: string } | null = null;
let prevViewMode: AppState["viewMode"] | null = null;

function init(): void {
  const panelsContainer = qs("#panels")!;

  // Create 3-column panel layout
  panelLayout = new PanelLayout(panelsContainer, [
    { id: "workspaces", minWidth: 200, defaultWidth: 0, hidden: true },
    { id: "chat", minWidth: 280, defaultWidth: 35 },
    { id: "diff", minWidth: 320, defaultWidth: 65 },
  ]);

  const wsPanel = panelLayout.getPanel("workspaces")!;
  const chatPanel = panelLayout.getPanel("chat")!;
  const diffPanel = panelLayout.getPanel("diff")!;

  const sidebarViews = h("div", { class: "sidebar-mode-views" });
  const workspacesSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-workspaces",
  });
  const pluginsSidebarHost = h("div", {
    class: "sidebar-mode-view sidebar-mode-view-plugins",
    hidden: true,
  });
  sidebarViews.appendChild(workspacesSidebarHost);
  sidebarViews.appendChild(pluginsSidebarHost);

  sidebarPrimaryPluginsBtn = h("button", {
    class: "sidebar-primary-btn",
    onclick: () => {
      appState.update((s) => ({ ...s, viewMode: "plugins" }));
      panelLayout.showPanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.add("active");
      void loadPlugins(true);
    },
  }, [
    pluginToolIcon("sidebar-primary-icon"),
    h("span", { class: "sidebar-primary-label" }, ["Plugins"]),
  ]) as HTMLButtonElement;

  const sidebarPrimaryActions = h("div", { class: "sidebar-primary-actions" }, [
    sidebarPrimaryPluginsBtn,
  ]);

  const sidebarShell = h("div", { class: "sidebar-shell" }, [
    sidebarPrimaryActions,
    sidebarViews,
  ]);
  wsPanel.appendChild(sidebarShell);

  // Workspaces sidebar
  sidebar = new Sidebar(workspacesSidebarHost, {
    onSelectSession: (sessionId, workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: sessionId,
        activeWorkspace: workspacePath,
      }));
      loadSessionTranscript(sessionId);
      loadDiff(workspacePath);
      ensureBranchHistory(workspacePath);
    },
    onNewSession: (workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: null,
        activeWorkspace: workspacePath,
      }));
      chatView.clear();
      chatView.focus();
      loadDiff(workspacePath);
      ensureBranchHistory(workspacePath);
    },
    onAddWorkspace: () => openWorkspace(),
    onRemoveWorkspace: (path) => removeWorkspace(path),
    onDeleteSession: async (sessionId, workspacePath) => {
      const state = appState.get();
      const isLiveSession = state.liveSessions.has(sessionId);
      const transcriptPath = (state.historySessions[workspacePath] ?? [])
        .find((h) => h.sessionId === sessionId)?.transcriptPath;

      if (isLiveSession) {
        try {
          await (rpc as any).request.killSession({ sessionId });
        } catch (err) {
          console.error("Failed to kill session:", err);
        }
      }

      try {
        await (rpc as any).request.deleteSession({
          sessionId,
          cwd: workspacePath,
          transcriptPath,
        });
      } catch (err) {
        console.error("Failed to delete session transcript:", err);
      }

      appState.update((s) => {
        const live = new Set(s.liveSessions);
        live.delete(sessionId);

        const names = { ...s.customSessionNames };
        delete names[sessionId];

        const wsHistory = s.historySessions[workspacePath] ?? [];
        const nextHistory = wsHistory.filter((h) => h.sessionId !== sessionId);

        return {
          ...s,
          liveSessions: live,
          historySessions: {
            ...s.historySessions,
            [workspacePath]: nextHistory,
          },
          customSessionNames: names,
          activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
        };
      });

      const next = appState.get();
      if (!next.activeSessionId) {
        chatView.clear();
      }
      loadDiff(workspacePath);
      loadSessionHistory(workspacePath);
    },
    onToggleWorkspace: (path) => {
      const state = appState.get();
      const wasExpanded = state.expandedWorkspaces.has(path);
      appState.update((s) => {
        const expanded = new Set(s.expandedWorkspaces);
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        return { ...s, expandedWorkspaces: expanded };
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
      appState.update((s) => ({ ...s, viewMode: "workspaces" }));
    },
  });

  // Chat panel
  chatView = new ChatView(chatPanel, {
    onStopSession: async () => {
      const state = appState.get();
      if (!state.activeSessionId) return;
      try {
        await (rpc as any).request.killSession({
          sessionId: state.activeSessionId,
        });
      } catch (err) {
        console.error("Failed to kill session:", err);
      }
    },
    onSendPrompt: async (prompt, fullAccess, selectedFiles) => {
      const state = appState.get();
      const cwd = state.activeWorkspace;
      if (!cwd) {
        openWorkspace();
        return;
      }

      try {
        const isLive = state.activeSessionId && state.liveSessions.has(state.activeSessionId);

        if (state.activeSessionId && isLive) {
          // Send follow-up to a running session
          await (rpc as any).request.sendFollowUp({
            sessionId: state.activeSessionId,
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
            sessionId: state.activeSessionId ?? undefined, // resume if set
            selectedFiles,
          });
          const live = new Set(state.liveSessions);
          live.add(sessionId);
          appState.update((s) => ({ ...s, activeSessionId: sessionId, liveSessions: live }));
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
      const cwd = appState.get().activeWorkspace;
      if (!cwd) return [];
      return searchWorkspaceFiles(cwd, query, 30);
    },
    onSearchCommands: async (query) => {
      const cwd = appState.get().activeWorkspace;
      if (!cwd) return [];
      return searchSlashCommands(cwd, query, 30);
    },
  });
  pluginsPreview = new PluginsPreview(chatPanel);

  // Diff panel
  diffView = new DiffView(diffPanel, {
    onBranchPanelToggle: (visible) => {
      const activeWorkspace = appState.get().activeWorkspace;
      if (!visible || !activeWorkspace) return;
      void loadBranchHistory(activeWorkspace, true);
    },
    onRequestFullFile: async (path) => {
      const cwd = appState.get().activeWorkspace;
      if (!cwd) {
        throw new Error("No active workspace");
      }
      return (rpc as any).request.getFileContent({ cwd, path });
    },
  });

  // Files panel (embedded inside diff panel)
  filesPanel = new FilesPanel(diffView.filesPanelHost, {
    onSelectFile: (path) => {
      diffView.showFile(path);
    },
    onScopeChange: (scope) => {
      appState.update((s) => ({ ...s, diffScope: scope }));
      const state = appState.get();
      if (state.activeWorkspace) {
        loadDiff(state.activeWorkspace, scope);
      }
    },
  });

  // Branch panel (embedded inside diff panel)
  branchPanel = new BranchPanel(diffView.branchPanelHost, {
    onSelectCommit: (commit) => {
      const cwd = appState.get().activeWorkspace;
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

  // Toggle workspaces button
  qs("#btn-toggle-workspaces")?.addEventListener("click", () => {
    panelLayout.togglePanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.toggle(
      "active",
      panelLayout.isPanelVisible("workspaces")
    );
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      panelLayout.togglePanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.toggle(
        "active",
        panelLayout.isPanelVisible("workspaces")
      );
    }
    if (mod && e.key === "n") {
      e.preventDefault();
      const state = appState.get();
      if (state.activeWorkspace) {
        appState.update((s) => ({ ...s, activeSessionId: null }));
        chatView.clear();
        chatView.focus();
      } else {
        openWorkspace();
      }
    }
    if (mod && e.key === "o") {
      e.preventDefault();
      openWorkspace();
    }
  });

  // State subscription — rebuild sidebar on every snapshot or workspace change
  appState.subscribe((state) => {
    const viewModeChanged = prevViewMode !== null && prevViewMode !== state.viewMode;
    const sidebarWidthBeforeSwitch = viewModeChanged ? wsPanel.offsetWidth : 0;

    const wsData = buildWorkspaceData(state);
    sidebar.render(wsData);
    sidebar.setActiveSession(state.activeSessionId);

    const pluginsSelection = resolvePluginSelection(
      state.plugins,
      state.pluginSelection
    );
    const isPluginsMode = state.viewMode === "plugins";

    sidebarPrimaryActions.hidden = isPluginsMode;
    workspacesSidebarHost.hidden = isPluginsMode;
    pluginsSidebarHost.hidden = !isPluginsMode;
    sidebarPrimaryPluginsBtn?.classList.toggle("active", isPluginsMode);

    pluginsSidebar.render(state.plugins, { loading: state.pluginsLoading });
    pluginsSidebar.setSelection(pluginsSelection);
    pluginsPreview.render(state.plugins, pluginsSelection, {
      loading: state.pluginsLoading,
    });

    chatView.element.hidden = isPluginsMode;
    pluginsPreview.setVisible(isPluginsMode);
    if (isPluginsMode) {
      panelLayout.hidePanel("diff");
      if (sidebarWidthBeforeSwitch > 0) {
        panelLayout.preservePanelPixelWidth("workspaces", sidebarWidthBeforeSwitch);
      }
      prevViewMode = state.viewMode;
      return;
    }
    panelLayout.showPanel("diff");
    if (sidebarWidthBeforeSwitch > 0) {
      panelLayout.preservePanelPixelWidth("workspaces", sidebarWidthBeforeSwitch);
    }
    prevViewMode = state.viewMode;

    chatView.setHeader(
      resolveActiveSessionTitle(state),
      state.activeWorkspace
    );
    const contextInfo = resolveActiveContextUsage(state);
    chatView.setContextUsage(
      contextInfo?.contextPercentage ?? null,
      contextInfo?.model ?? null,
      contextInfo?.activity ?? null,
      contextInfo?.promptTokens ?? null
    );

    const activeWorkspace = state.activeWorkspace;
    const branchCommits = activeWorkspace
      ? (state.branchHistory[activeWorkspace] ?? EMPTY_BRANCH_COMMITS)
      : EMPTY_BRANCH_COMMITS;
    if (
      activeWorkspace !== prevBranchWorkspace
      || branchCommits !== prevBranchCommits
    ) {
      if (activeWorkspace) {
        branchPanel.render(branchCommits);
        const activeCommitHash = activeCommitDiff?.cwd === activeWorkspace
          ? activeCommitDiff.hash
          : null;
        branchPanel.setActiveCommit(activeCommitHash);
      } else {
        branchPanel.clear();
      }
      prevBranchWorkspace = activeWorkspace;
      prevBranchCommits = branchCommits;
    }
  });

  // Load initial data
  loadWorkspaces();
  loadSessionNames();
  loadPlugins();
}

// ── Actions ──────────────────────────────────────────────────────

async function loadSessionTranscript(sessionId: string): Promise<void> {
  try {
    // Check if this is a historical session with a known transcript path
    const state = appState.get();
    let transcriptPath: string | undefined;
    for (const sessions of Object.values(state.historySessions)) {
      const found = sessions.find((s) => s.sessionId === sessionId);
      if (found) {
        transcriptPath = found.transcriptPath;
        break;
      }
    }
    const messages: TranscriptMessage[] = await (rpc as any).request.getTranscript({
      sessionId,
      transcriptPath,
    });
    chatView.renderTranscript(messages);
  } catch (err) {
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
    const commits: BranchCommit[] = await (rpc as any).request.getBranchHistory({
      cwd,
      limit: 120,
    });
    appState.update((s) => {
      const loaded = new Set(s.loadedBranchHistory);
      loaded.add(cwd);
      return {
        ...s,
        branchHistory: {
          ...s.branchHistory,
          [cwd]: commits,
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

function clearCommitDiffSelection(cwd: string): void {
  if (!activeCommitDiff || activeCommitDiff.cwd !== cwd) return;
  activeCommitDiff = null;

  const activeWorkspace = appState.get().activeWorkspace;
  if (activeWorkspace === cwd) {
    branchPanel.setActiveCommit(null);
  }
}

function applyDiffFiles(files: DiffFile[]): void {
  filesPanel.render(files);
  diffView.setFiles(files);
  if (files.length > 0) {
    filesPanel.setActiveFile(files[0].path);
    diffView.showFile(files[0].path);
  } else {
    diffView.clear();
  }
}

async function loadDiff(cwd: string, scope?: DiffScope): Promise<void> {
  clearCommitDiffSelection(cwd);

  try {
    const state = appState.get();
    const selectedScope = scope ?? state.diffScope;
    const sessionId = selectedScope === "last_turn"
      && state.activeWorkspace === cwd
      ? (state.activeSessionId ?? undefined)
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

async function loadWorkspaces(): Promise<void> {
  try {
    const workspaces: string[] = await (rpc as any).request.getWorkspaces({});
    const expanded = new Set<string>();
    // Auto-expand first workspace
    if (workspaces.length > 0) {
      expanded.add(workspaces[0]);
    }
    appState.update((s) => ({
      ...s,
      workspaces,
      expandedWorkspaces: expanded,
      activeWorkspace: workspaces[0] ?? null,
    }));
    // Auto-show workspaces panel if we have workspaces
    if (workspaces.length > 0) {
      panelLayout.showPanel("workspaces");
      qs("#btn-toggle-workspaces")?.classList.add("active");
      // Load diff and history for first workspace
      loadDiff(workspaces[0], appState.get().diffScope);
      loadSessionHistory(workspaces[0]);
      for (const wsPath of workspaces) {
        ensureBranchHistory(wsPath);
      }
    }
  } catch {
    // First run — no workspaces yet
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

async function openWorkspace(): Promise<void> {
  try {
    const dir: string | null = await (rpc as any).request.pickDirectory({});
    if (!dir) return;

    await (rpc as any).request.addWorkspace({ path: dir });
    const state = appState.get();
    const expanded = new Set(state.expandedWorkspaces);
    expanded.add(dir);

    appState.update((s) => ({
      ...s,
      workspaces: [dir, ...s.workspaces.filter((w) => w !== dir)],
      expandedWorkspaces: expanded,
      activeWorkspace: dir,
    }));

    panelLayout.showPanel("workspaces");
    qs("#btn-toggle-workspaces")?.classList.add("active");
    loadDiff(dir, appState.get().diffScope);
    loadSessionHistory(dir);
    ensureBranchHistory(dir);
  } catch (err) {
    console.error("Failed to pick directory:", err);
  }
}

async function removeWorkspace(path: string): Promise<void> {
  try {
    await (rpc as any).request.removeWorkspace({ path });
    workspaceFileCache.delete(path);
    slashCommandCache.delete(path);
    if (activeCommitDiff?.cwd === path) {
      activeCommitDiff = null;
    }
    appState.update((s) => {
      const workspaces = s.workspaces.filter((w) => w !== path);
      const expanded = new Set(s.expandedWorkspaces);
      const loadedBranchHistory = new Set(s.loadedBranchHistory);
      expanded.delete(path);
      loadedBranchHistory.delete(path);
      const branchHistory = { ...s.branchHistory };
      delete branchHistory[path];
      return {
        ...s,
        workspaces,
        expandedWorkspaces: expanded,
        branchHistory,
        loadedBranchHistory,
        activeWorkspace: s.activeWorkspace === path
          ? (workspaces[0] ?? null)
          : s.activeWorkspace,
      };
    });

    const nextWorkspace = appState.get().activeWorkspace;
    if (nextWorkspace) {
      ensureBranchHistory(nextWorkspace);
    }
  } catch (err) {
    console.error("Failed to remove workspace:", err);
  }
}

async function searchWorkspaceFiles(
  cwd: string,
  query: string,
  limit: number
): Promise<string[]> {
  const cached = workspaceFileCache.get(cwd);
  let files = cached?.files;
  const cacheAgeMs = cached ? Date.now() - cached.loadedAt : Number.POSITIVE_INFINITY;
  if (!files || cacheAgeMs > WORKSPACE_FILE_CACHE_MS) {
    const loaded = await (rpc as any).request.getWorkspaceFiles({ cwd });
    files = Array.isArray(loaded) ? loaded : [];
    workspaceFileCache.set(cwd, { files, loadedAt: Date.now() });
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return files.slice(0, limit);
  }

  return files
    .map((path) => ({ path, score: scoreWorkspaceFile(path, normalizedQuery) }))
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

function scoreWorkspaceFile(path: string, query: string): number {
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

function buildWorkspaceData(state: AppState): WorkspaceData[] {
  const liveSessions = state.snapshot
    ? buildSessionList(state.snapshot)
    : [];

  return state.workspaces.map((wsPath) => {
    const name = wsPath.split("/").pop() ?? wsPath;
    const branch = resolveWorkspaceBranchName(
      state.branchHistory[wsPath] ?? EMPTY_BRANCH_COMMITS
    );
    // Live sessions for this workspace
    const wsLive = liveSessions.filter((s) => s.cwd === wsPath);
    const liveIds = new Set(wsLive.map((s) => s.sessionId));

    // Historical sessions (exclude any that are already live)
    const history = (state.historySessions[wsPath] ?? [])
      .filter((h) => !liveIds.has(h.sessionId))
      .map(historyToSessionInfo);

    // Apply custom names to all sessions
    const allSessions = [...wsLive, ...history].map((s) => ({
      ...s,
      topic: state.customSessionNames[s.sessionId] ?? s.topic,
    }));

    return {
      path: wsPath,
      name,
      branch,
      active: state.activeWorkspace === wsPath,
      sessions: allSessions,
      expanded: state.expandedWorkspaces.has(wsPath),
    };
  });
}

function resolveWorkspaceBranchName(commits: BranchCommit[]): string | null {
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
  const activeSessionId = state.activeSessionId;
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
  const activeSessionId = state.activeSessionId;
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
