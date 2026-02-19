import Electrobun, { Electroview } from "electrobun/view";
import { Store } from "./lib/state.ts";
import { qs } from "./lib/dom.ts";
import { PanelLayout } from "./components/panel-layout.ts";
import { Sidebar, type WorkspaceData } from "./components/sidebar.ts";
import { ChatView } from "./components/chat-view.ts";
import { DiffView } from "./components/diff-view.ts";
import { FilesPanel } from "./components/files-panel.ts";
import type {
  SessionInfo,
  Snapshot,
  ClaudeStreamEvent,
  TranscriptMessage,
  DiffFile,
  DiffScope,
  Activity,
  HistorySession,
  ToolApprovalRequest,
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
        const state = appState.get();
        if (state.activeSessionId === sessionId && chatView) {
          chatView.appendStreamEvent(event);
        }
        if (
          state.activeSessionId === sessionId
          && state.activeWorkspace
          && ((event as any).type === "result" || isDiffMutationEvent(event))
        ) {
          scheduleDiffRefresh(
            state.activeWorkspace,
            state.diffScope,
            (event as any).type === "result" ? 0 : 120
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
        const state = appState.get();
        const live = new Set(state.liveSessions);
        live.delete(sessionId);
        appState.update((s) => ({ ...s, liveSessions: live }));
        // Refresh diff when a session ends (changes may have been made)
        if (state.activeWorkspace) {
          loadDiff(state.activeWorkspace);
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
  workspaces: string[];
  expandedWorkspaces: Set<string>;
  activeWorkspace: string | null;
  activeSessionId: string | null;
  diffScope: DiffScope;
  historySessions: Record<string, HistorySession[]>; // workspace path → history
  liveSessions: Set<string>; // session IDs with running processes
  customSessionNames: Record<string, string>; // sessionId → custom name
};

const appState = new Store<AppState>({
  snapshot: null,
  workspaces: [],
  expandedWorkspaces: new Set(),
  activeWorkspace: null,
  activeSessionId: null,
  diffScope: "last_turn",
  historySessions: {},
  liveSessions: new Set(),
  customSessionNames: {},
});

// ── Components ───────────────────────────────────────────────────

let panelLayout: PanelLayout;
let sidebar: Sidebar;
let chatView: ChatView;
let diffView: DiffView;
let filesPanel: FilesPanel;
let diffRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function init(): void {
  const panelsContainer = qs("#panels")!;

  // Create 4-column panel layout
  panelLayout = new PanelLayout(panelsContainer, [
    { id: "workspaces", minWidth: 200, defaultWidth: 0, hidden: true },
    { id: "chat", minWidth: 280, defaultWidth: 30 },
    { id: "diff", minWidth: 300, defaultWidth: 50 },
    { id: "files", minWidth: 140, defaultWidth: 20 },
  ]);

  const wsPanel = panelLayout.getPanel("workspaces")!;
  const chatPanel = panelLayout.getPanel("chat")!;
  const diffPanel = panelLayout.getPanel("diff")!;
  const filesP = panelLayout.getPanel("files")!;

  // Sidebar (workspaces panel)
  sidebar = new Sidebar(wsPanel, {
    onSelectSession: (sessionId, workspacePath) => {
      appState.update((s) => ({
        ...s,
        activeSessionId: sessionId,
        activeWorkspace: workspacePath,
      }));
      loadSessionTranscript(sessionId);
      loadDiff(workspacePath);
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
    onSendPrompt: async (prompt, fullAccess) => {
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
          });
        } else {
          // New session or resume a historical/finished session
          const { sessionId } = await (rpc as any).request.sendPrompt({
            prompt,
            cwd,
            fullAccess,
            sessionId: state.activeSessionId ?? undefined, // resume if set
          });
          const live = new Set(state.liveSessions);
          live.add(sessionId);
          appState.update((s) => ({ ...s, activeSessionId: sessionId, liveSessions: live }));
        }
      } catch (err) {
        console.error("Failed to send prompt:", err);
      }
    },
    onOpenInFinder: async (path) => {
      try {
        await (rpc as any).request.openInFinder({ path });
      } catch (err) {
        console.error("Failed to open Finder:", err);
      }
    },
  });

  // Diff panel
  diffView = new DiffView(diffPanel);

  // Files panel
  filesPanel = new FilesPanel(filesP, {
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
    const wsData = buildWorkspaceData(state);
    sidebar.render(wsData);
    sidebar.setActiveSession(state.activeSessionId);
    chatView.setHeader(
      resolveActiveSessionTitle(state),
      state.activeWorkspace
    );
  });

  // Load initial data
  loadWorkspaces();
  loadSessionNames();
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

async function loadDiff(cwd: string, scope?: DiffScope): Promise<void> {
  try {
    const selectedScope = scope ?? appState.get().diffScope;
    filesPanel.setScope(selectedScope);
    const files: DiffFile[] = await (rpc as any).request.getDiff({
      cwd,
      scope: selectedScope,
    });
    filesPanel.render(files);
    diffView.setFiles(files);
    if (files.length > 0) {
      filesPanel.setActiveFile(files[0].path);
      diffView.showFile(files[0].path);
    } else {
      diffView.clear();
    }
  } catch (err) {
    console.error("Failed to load diff:", err);
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
  } catch (err) {
    console.error("Failed to pick directory:", err);
  }
}

async function removeWorkspace(path: string): Promise<void> {
  try {
    await (rpc as any).request.removeWorkspace({ path });
    appState.update((s) => {
      const workspaces = s.workspaces.filter((w) => w !== path);
      const expanded = new Set(s.expandedWorkspaces);
      expanded.delete(path);
      return {
        ...s,
        workspaces,
        expandedWorkspaces: expanded,
        activeWorkspace: s.activeWorkspace === path
          ? (workspaces[0] ?? null)
          : s.activeWorkspace,
      };
    });
  } catch (err) {
    console.error("Failed to remove workspace:", err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function buildWorkspaceData(state: AppState): WorkspaceData[] {
  const liveSessions = state.snapshot
    ? buildSessionList(state.snapshot)
    : [];

  return state.workspaces.map((wsPath) => {
    const name = wsPath.split("/").pop() ?? wsPath;
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
      sessions: allSessions,
      expanded: state.expandedWorkspaces.has(wsPath),
    };
  });
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
    if (live?.topic?.trim()) return live.topic.trim();
    if (live?.prompt?.trim()) return live.prompt.trim();
  }

  for (const sessions of Object.values(state.historySessions)) {
    const found = sessions.find((s) => s.sessionId === activeSessionId);
    if (!found) continue;
    if (found.topic?.trim()) return found.topic.trim();
    if (found.prompt?.trim()) return found.prompt.trim();
    break;
  }

  return "Session";
}

// ── Boot ─────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
