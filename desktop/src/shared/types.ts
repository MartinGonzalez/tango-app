import type { RPCSchema } from "electrobun/bun";

// ── Snapshot types (matches watcher server /api/snapshot) ────────

export type Task = {
  sessionId: string;
  pid: number | null;
  title: string;
  cwd: string | null;
  status: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  lastNotes: string;
  transcriptPath: string | null;
  prompt: string | null;
  topic: string | null;
  contextPercentage: number | null;
  model: string | null;
  currentTool: string | null;
  currentToolLabel: string | null;
};

export type Subagent = {
  agentId: string;
  parentSessionId: string;
  agentType: string;
  description: string | null;
  currentTool: string | null;
  toolHistory: { tool: string; at: string }[];
  subagentSessionId: string | null;
  startedAt: string;
};

export type ProcessInfo = {
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  stat: string;
  elapsed: string;
  command: string;
  state: string;
  appName: string;
  seenAt: string;
  task: Task | null;
  activity: Activity;
  attribution: string;
};

export type Activity =
  | "working"
  | "waiting"
  | "waiting_for_input"
  | "idle"
  | "finished";

export type Snapshot = {
  timestamp: string;
  processes: ProcessInfo[];
  tasks: Task[];
  subagents: Subagent[];
  eventCount: number;
};

// ── Transcript types ─────────────────────────────────────────────

export type TranscriptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timestamp?: string;
};

// ── Session types ────────────────────────────────────────────────

export type SessionInfo = {
  sessionId: string;
  topic: string | null;
  prompt: string | null;
  cwd: string | null;
  activity: Activity;
  model: string | null;
  contextPercentage: number | null;
  currentToolLabel: string | null;
  startedAt: string;
  updatedAt: string;
  isAppSpawned: boolean;
  transcriptPath: string | null;
};

// ── History types ────────────────────────────────────────────

export type HistorySession = {
  sessionId: string;
  cwd: string | null;
  prompt: string | null;
  topic: string | null;
  model: string | null;
  startedAt: string | null;
  lastActiveAt: string | null;
  transcriptPath: string;
};

// ── Diff types ───────────────────────────────────────────────────

export type DiffFile = {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  hunks: DiffHunk[];
  isBinary: boolean;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
};

export type DiffLine = {
  type: "add" | "delete" | "context";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
};

export type DiffScope = "last_turn" | "all";

export type WorkspaceFileContent = {
  content: string;
  truncated: boolean;
  isBinary: boolean;
};

// ── Branch history types ────────────────────────────────────────

export type BranchRefKind = "head" | "branch" | "remote" | "tag" | "other";

export type BranchRef = {
  name: string;
  label: string;
  kind: BranchRefKind;
};

export type BranchCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeTime: string;
  refs: BranchRef[];
  isHead: boolean;
  isPushed: boolean;
};

// ── Stream event types (claude -p --output-format stream-json --verbose) ──
// These match the real output of `claude -p --output-format stream-json --verbose`

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type ClaudeStreamEvent =
  | {
      type: "system";
      subtype: "init";
      session_id: string;
      model?: string;
      cwd?: string;
      tools?: string[];
      [key: string]: unknown;
    }
  | {
      type: "system";
      subtype: string; // hook_started, hook_response, etc.
      session_id: string;
      [key: string]: unknown;
    }
  | {
      type: "assistant";
      message: {
        id: string;
        role: "assistant";
        content: ContentBlock[];
        model: string;
        stop_reason: string | null;
        usage?: Record<string, unknown>;
      };
      session_id: string;
      parent_tool_use_id: string | null;
      [key: string]: unknown;
    }
  | {
      type: "result";
      subtype: "success";
      is_error: boolean;
      result: string;
      session_id: string;
      duration_ms: number;
      total_cost_usd: number;
      num_turns: number;
      [key: string]: unknown;
    }
  | {
      type: "user";
      message: {
        role: "user";
        content: ContentBlock[];
      };
      session_id: string;
      tool_use_result?: {
        stdout?: string;
        stderr?: string;
        interrupted?: boolean;
      };
      [key: string]: unknown;
    }
  | {
      type: "error";
      error: { message: string; code?: string };
      session_id?: string;
    };

// ── Tool approval types ──────────────────────────────────────────

export type ToolApprovalRequest = {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
};

export type SlashCommandSource = "project" | "user";

export type SlashCommandEntry = {
  name: string;
  source: SlashCommandSource;
};

export type PluginItemKind = "command" | "agent" | "skill";

export type PluginItem = {
  id: string;
  kind: PluginItemKind;
  name: string;
  description: string;
  content: string;
  relativePath: string;
  updatedAt: string | null;
};

export type InstalledPlugin = {
  id: string;
  pluginName: string;
  displayName: string;
  marketplace: string;
  sourceLabel: string;
  version: string | null;
  description: string;
  authorName: string | null;
  installPath: string;
  installedAt: string | null;
  lastUpdated: string | null;
  status: "enabled" | "disabled";
  commands: PluginItem[];
  agents: PluginItem[];
  skills: PluginItem[];
};

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
  workspacePath: string;
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
  workspacePath: string;
  title: string;
  notes: string;
  planMarkdown: string | null;
  status: TaskCardStatus;
  sources: TaskSource[];
  lastRun: TaskRun | null;
  createdAt: string;
  updatedAt: string;
};

// ── RPC contract ─────────────────────────────────────────────────

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      getSessions: {
        params: {};
        response: SessionInfo[];
      };
      getTranscript: {
        params: { sessionId: string; transcriptPath?: string };
        response: TranscriptMessage[];
      };
      sendPrompt: {
        params: {
          prompt: string;
          cwd: string;
          fullAccess?: boolean;
          sessionId?: string;
          selectedFiles?: string[];
        };
        response: { sessionId: string };
      };
      sendFollowUp: {
        params: {
          sessionId: string;
          text: string;
          fullAccess?: boolean;
          selectedFiles?: string[];
        };
        response: void;
      };
      respondPermission: {
        params: { sessionId: string; toolUseId: string; allow: boolean };
        response: void;
      };
      respondToolApproval: {
        params: { toolUseId: string; allow: boolean };
        response: void;
      };
      renameSession: {
        params: { sessionId: string; newName: string };
        response: void;
      };
      killSession: {
        params: { sessionId: string };
        response: void;
      };
      deleteSession: {
        params: { sessionId: string; cwd?: string; transcriptPath?: string };
        response: { deleted: boolean; transcriptPath?: string | null };
      };
      getSessionHistory: {
        params: { cwd: string };
        response: HistorySession[];
      };
      getDiff: {
        params: { cwd: string; scope?: DiffScope; sessionId?: string };
        response: DiffFile[];
      };
      getCommitDiff: {
        params: { cwd: string; commitHash: string };
        response: DiffFile[];
      };
      getBranchHistory: {
        params: { cwd: string; limit?: number };
        response: BranchCommit[];
      };
      getWorkspaces: {
        params: {};
        response: string[];
      };
      getSessionNames: {
        params: {};
        response: Record<string, string>;
      };
      getWorkspaceFiles: {
        params: { cwd: string };
        response: string[];
      };
      getSlashCommands: {
        params: { cwd: string };
        response: SlashCommandEntry[];
      };
      getInstalledPlugins: {
        params: {};
        response: InstalledPlugin[];
      };
      getWorkspaceTasks: {
        params: { workspacePath: string };
        response: TaskCardSummary[];
      };
      getTaskDetail: {
        params: { taskId: string };
        response: TaskCardDetail | null;
      };
      createTask: {
        params: { workspacePath: string; title?: string; notes?: string };
        response: TaskCardDetail;
      };
      updateTask: {
        params: {
          taskId: string;
          patch: {
            title?: string;
            notes?: string;
            status?: TaskCardStatus;
            planMarkdown?: string | null;
          };
        };
        response: TaskCardDetail | null;
      };
      deleteTask: {
        params: { taskId: string };
        response: void;
      };
      addTaskSource: {
        params: {
          taskId: string;
          kind: TaskSourceKind;
          url?: string | null;
          content?: string | null;
        };
        response: TaskSource;
      };
      updateTaskSource: {
        params: {
          sourceId: string;
          patch: {
            title?: string | null;
            content?: string | null;
            url?: string | null;
          };
        };
        response: TaskSource | null;
      };
      removeTaskSource: {
        params: { sourceId: string };
        response: void;
      };
      fetchTaskSource: {
        params: { sourceId: string };
        response: TaskSource | null;
      };
      runTaskAction: {
        params: { taskId: string; action: TaskAction };
        response: { runId: string; sessionId: string | null };
      };
      getTaskRuns: {
        params: { taskId: string; limit?: number };
        response: TaskRun[];
      };
      getFileContent: {
        params: { cwd: string; path: string; maxBytes?: number };
        response: WorkspaceFileContent;
      };
      addWorkspace: {
        params: { path: string };
        response: void;
      };
      removeWorkspace: {
        params: { path: string };
        response: void;
      };
      openInFinder: {
        params: { path: string };
        response: void;
      };
      pickDirectory: {
        params: {};
        response: string | null;
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      snapshotUpdate: Snapshot;
      sessionStream: {
        sessionId: string;
        event: ClaudeStreamEvent;
      };
      sessionIdResolved: {
        tempId: string;
        realId: string;
      };
      sessionEnded: {
        sessionId: string;
        exitCode: number;
      };
      toolApproval: ToolApprovalRequest;
      tasksChanged: {
        workspacePath: string;
        taskId?: string;
      };
    };
  }>;
};
