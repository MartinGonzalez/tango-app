import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import { appendFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { WatcherClient } from "./watcher-client.ts";
import { SessionManager } from "./session-manager.ts";
import { readTranscript } from "./transcript-reader.ts";
import {
  getDiff,
  beginTurnDiff,
  finalizeTurnDiff,
  setTurnDiffSession,
  remapTurnDiffSessionId,
  clearLastTurnDiffForSession,
  clearLastTurnDiffForStage,
} from "./diff-provider.ts";
import { getBranchHistory, getCommitDiff } from "./branch-history.ts";
import { getVcsStrategy, getVcsInfo, invalidateVcsCache } from "./vcs/vcs-provider.ts";
import {
  generateCommitMessage,
  getCommitContext,
  performCommit,
} from "./commit-provider.ts";
import { listSessionsForStage } from "./session-history.ts";
import { StageStore } from "./stage-store.ts";
import { ApprovalServer } from "./approval-server.ts";
import { installApprovalHook } from "./hook-installer.ts";
import { SessionNamesStore } from "./session-names-store.ts";
import {
  getStageFiles,
  getStageFileContent,
  invalidateStageFilesCache,
} from "./stage-files.ts";
import {
  getSlashCommands,
  invalidateSlashCommandsCache,
} from "./slash-commands.ts";
import {
  getInstalledPlugins,
  invalidateInstalledPluginsCache,
} from "./plugins.ts";
import {
  getAssignedPullRequests,
  getOpenedPullRequests,
  getReviewRequestedPullRequests,
  getPullRequestDetail,
  getPullRequestDiff,
  replyPullRequestReviewComment,
  createPullRequestReviewComment,
} from "./pr-provider.ts";
import { TaskRepository } from "./task-repository.ts";
import { TasksStore } from "./tasks-store.ts";
import { PRReviewStore } from "./pr-review-store.ts";
import { PRAgentReviewStore } from "./pr-agent-review-store.ts";
import { PRAgentReviewProvider } from "./pr-agent-review-provider.ts";
import { isAgentReviewPlaceholderPayload } from "./pr-agent-review-files.ts";
import { ConnectorsRepository } from "./connectors-repository.ts";
import { InstrumentRuntime } from "./instruments/runtime.ts";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getStagePathVariantsSync,
} from "./project-path.ts";
import type {
  AppRPC,
  InstrumentBackendContext,
  InstrumentRegistryEntry,
  SessionInfo,
  Snapshot,
  Activity,
  TaskAction,
  TaskCardStatus,
  ConnectorProvider,
  TaskSourceKind,
  PullRequestAgentReviewRun,
} from "../shared/types.ts";

console.log("Tango starting...");

const TASKS_INSTRUMENT_ID = "tasks";
const LEGACY_TASKS_DB_PATH = join(homedir(), ".tango", "tasks.db");
const TASKS_INSTRUMENT_DB_PATH = join(
  homedir(),
  ".tango",
  "instruments",
  TASKS_INSTRUMENT_ID,
  "db",
  "tasks.db"
);
const TASKS_MIGRATION_MARKER_KEY = "migration.tasks-db.completedAt";
const MAINVIEW_LOG_PATH = join(homedir(), ".tango", "logs", "mainview.log");

function writeMainviewLogLine(line: string): void {
  try {
    mkdirSync(dirname(MAINVIEW_LOG_PATH), { recursive: true });
    appendFileSync(MAINVIEW_LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // best-effort only
  }
}

type TasksMigrationState = {
  migrated: boolean;
  blocked: boolean;
  completedAt: string | null;
  backupPath: string | null;
  error: string | null;
};

let tasksMigrationState = migrateLegacyTasksDbSync();

// ── Services ─────────────────────────────────────────────────────

const watcher = new WatcherClient();
const sessions = new SessionManager();
const stages = new StageStore();
const approvals = new ApprovalServer();
const sessionNames = new SessionNamesStore();
const connectors = new ConnectorsRepository();
const taskRepository = new TaskRepository(
  new TasksStore(TASKS_INSTRUMENT_DB_PATH),
  connectors
);
const prReviewStore = new PRReviewStore();
const prAgentReviewStore = new PRAgentReviewStore();
const prAgentReviewProvider = new PRAgentReviewProvider({
  getStagePaths: () => stages.getAll(),
});

const instrumentRuntime = new InstrumentRuntime({
  bundledInstallPaths: resolveBundledInstrumentInstallPaths(),
  onEvent: (event) => {
    mainRPC?.send.instrumentEvent(event);
  },
  invokeHandlers: {
    tasks: (ctx, method, params) => invokeTasksInstrument(ctx, method, params),
  },
});

let latestSnapshot: Snapshot | null = null;
let mainRPC: any = null;
const sessionCwds = new Map<string, string>();
const taskRunsBySession = new Map<string, {
  runId: string;
  taskId: string;
  action: TaskAction;
  stagePath: string;
}>();
const prAgentRunsBySession = new Map<string, {
  runId: string;
  repo: string;
  number: number;
}>();
const prAgentApplyRunsBySession = new Map<string, {
  runId: string;
  repo: string;
  number: number;
  reviewVersion: number;
  suggestionIndex: number;
}>();
const hiddenTaskSessionIds = new Set<string>(taskRepository.listHiddenSessionIds());
const HIDDEN_TASK_PROMPT_PREFIXES = [
  "You are improving a task note for an engineering workflow.",
  "You are planning a software engineering task.",
];
const IMPROVE_TASK_MODEL = process.env.CLAUDE_TASK_IMPROVE_MODEL?.trim()
  || "claude-haiku-4-5-20251001";
const PLAN_TASK_MODEL = process.env.CLAUDE_TASK_PLAN_MODEL?.trim()
  || "opus";

function resolveBundledInstrumentInstallPaths(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const explicit = process.env.TANGO_BUNDLED_INSTRUMENTS?.trim();
  const envPaths = explicit
    ? explicit
      .split(",")
      .map((value) => resolve(String(value).trim()))
      .filter(Boolean)
    : [];

  const candidates = [
    ...envPaths,
    resolve(moduleDir, "../instruments/tasks"),
    resolve(moduleDir, "../../instruments/tasks"),
    resolve(moduleDir, "../../../instruments/tasks"),
    resolve(cwd, "desktop/instruments/tasks"),
    resolve(cwd, "instruments/tasks"),
  ];

  const deduped: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || deduped.includes(candidate)) continue;
    if (!existsSync(join(candidate, "package.json"))) continue;
    deduped.push(candidate);
  }
  return deduped;
}

function migrateLegacyTasksDbSync(): TasksMigrationState {
  const state: TasksMigrationState = {
    migrated: false,
    blocked: false,
    completedAt: null,
    backupPath: null,
    error: null,
  };

  try {
    mkdirSync(dirname(TASKS_INSTRUMENT_DB_PATH), { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...state,
      blocked: true,
      error: `Failed to create tasks instrument db directory: ${message}`,
    };
  }

  const targetExists = existsSync(TASKS_INSTRUMENT_DB_PATH);
  const legacyExists = existsSync(LEGACY_TASKS_DB_PATH);

  if (!legacyExists || targetExists) {
    return state;
  }

  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const backupPath = `${LEGACY_TASKS_DB_PATH}.${timestamp}.backup`;

  try {
    copyFileSync(LEGACY_TASKS_DB_PATH, backupPath);
    copyFileSync(LEGACY_TASKS_DB_PATH, TASKS_INSTRUMENT_DB_PATH);
    return {
      migrated: true,
      blocked: false,
      completedAt: new Date().toISOString(),
      backupPath,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      migrated: false,
      blocked: true,
      completedAt: null,
      backupPath,
      error: `Tasks migration failed: ${message}`,
    };
  }
}

// ── Auto-start watcher server if needed ──────────────────────────

async function ensureServer(): Promise<void> {
  if (process.env.TANGO_DISABLE_WATCHER_AUTOSTART === "1") {
    console.warn("Watcher auto-start disabled (TANGO_DISABLE_WATCHER_AUTOSTART=1)");
    return;
  }
  const up = await watcher.isServerUp();
  if (up) {
    console.log("Watcher server already running");
    return;
  }

  console.log("Starting watcher server...");
  const cwd = process.cwd();
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.CLAUDE_WATCHER_SERVER?.trim(),
    // Bundled app path after deploy: Contents/Resources/app/server/src/server.js
    resolve(moduleDir, "../server/src/server.js"),
    resolve(cwd, "../server/src/server.js"),
    resolve(cwd, "server/src/server.js"),
  ].filter((value): value is string => Boolean(value));

  const serverPath = candidates.find((candidate) => existsSync(candidate));
  if (!serverPath) {
    console.warn(
      `Watcher server entrypoint not found. Checked: ${candidates.join(", ")}. Running in degraded mode`
    );
    return;
  }

  try {
    const bundledBun = resolve(dirname(process.argv0), "bun");
    const runtimeCandidates = [
      process.env.CLAUDE_WATCHER_RUNTIME?.trim(),
      existsSync(bundledBun) ? bundledBun : null,
      "bun",
      "node",
    ].filter((value, index, array): value is string => {
      return Boolean(value) && array.indexOf(value) === index;
    });

    let spawned = false;
    const failures: string[] = [];
    for (const runtime of runtimeCandidates) {
      try {
        Bun.spawn([runtime, serverPath], {
          env: { ...process.env, PORT: "4242" },
          stdio: ["ignore", "ignore", "ignore"],
        });
        console.log(`Watcher server spawned via: ${runtime}`);
        spawned = true;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${runtime}: ${message}`);
      }
    }

    if (!spawned) {
      console.warn(`Failed to spawn watcher server: ${failures.join(" | ")}`);
      return;
    }
  } catch (err) {
    console.warn("Unexpected error while starting watcher server:", err);
    return;
  }

  // Wait up to 5s for server
  for (let i = 0; i < 25; i++) {
    await Bun.sleep(200);
    if (await watcher.isServerUp()) {
      console.log("Watcher server started");
      return;
    }
  }
  console.warn("Watcher server failed to start — running in degraded mode");
}

// ── Watcher callbacks ────────────────────────────────────────────

watcher.onSnapshot((snapshot) => {
  const filteredSnapshot = filterSnapshotHiddenTaskSessions(snapshot);
  latestSnapshot = filteredSnapshot;
  mainRPC?.send.snapshotUpdate(filteredSnapshot);
});

watcher.onError((err) => {
  console.error("Watcher poll error:", err.message);
});

// ── Session manager callbacks ────────────────────────────────────

sessions.onIdResolved((tempId, realId) => {
  // Move approval policy from temp ID to real session ID
  approvals.resolveSessionId(tempId, realId);
  const taskRun = taskRunsBySession.get(tempId);
  if (taskRun) {
    taskRunsBySession.delete(tempId);
    taskRunsBySession.set(realId, taskRun);
    taskRepository.bindRunSession(taskRun.runId, realId);
    if (taskRun.action !== "execute") {
      remapHiddenTaskSessionId(tempId, realId);
    }
  }
  const cwd = sessionCwds.get(tempId);
  if (cwd) {
    sessionCwds.delete(tempId);
    sessionCwds.set(realId, cwd);
    void remapTurnDiffSessionId(cwd, tempId, realId).catch((err) => {
      console.warn("Failed to remap per-session diff state:", err);
    });
  }
  const prAgentRun = prAgentRunsBySession.get(tempId);
  if (prAgentRun) {
    prAgentRunsBySession.set(realId, prAgentRun);
    void prAgentReviewStore.bindSessionId(prAgentRun.runId, realId).catch((err) => {
      console.warn("Failed to bind agent review session id:", err);
    });
  }
  const prAgentApplyRun = prAgentApplyRunsBySession.get(tempId);
  if (prAgentApplyRun) {
    prAgentApplyRunsBySession.delete(tempId);
    prAgentApplyRunsBySession.set(realId, prAgentApplyRun);
  }
  // Notify webview to update its activeSessionId.
  // RPC messages are ordered — this always arrives before events with realId.
  mainRPC?.send.sessionIdResolved({ tempId, realId });
});

sessions.onEvent((sessionId, event) => {
  void handleSessionEvent(sessionId, event);
});

sessions.onEnd((sessionId, exitCode) => {
  approvals.unregisterSession(sessionId);
  sessionCwds.delete(sessionId);
  const prAgentRun = prAgentRunsBySession.get(sessionId);
  if (prAgentRun) {
    clearAgentRunSessionBindings(prAgentRun.runId);
    void finalizeAgentReviewRunFromExit(prAgentRun, exitCode);
    return;
  }
  const prAgentApplyRun = prAgentApplyRunsBySession.get(sessionId);
  if (prAgentApplyRun) {
    prAgentApplyRunsBySession.delete(sessionId);
    void finalizeAgentReviewApplyFromExit(prAgentApplyRun, exitCode);
    return;
  }
  const taskRun = taskRunsBySession.get(sessionId);
  if (taskRun) {
    taskRunsBySession.delete(sessionId);
    try {
      const { task } = taskRepository.finalizeRun(taskRun.runId, {
        success: exitCode === 0,
        exitCode,
        error: exitCode === 0 ? null : `Session exited with code ${exitCode}`,
      });
      notifyTasksChanged(task.stagePath, task.id);
    } catch (err) {
      console.warn("Failed to finalize task run:", err);
    }
  }
  mainRPC?.send.sessionEnded({ sessionId, exitCode });
});

sessions.onError((sessionId, error) => {
  console.error(`Session ${sessionId} error:`, error);
  const prAgentRun = prAgentRunsBySession.get(sessionId);
  if (prAgentRun) {
    void failAgentReviewRun(prAgentRun, error, "failed");
    return;
  }
  const prAgentApplyRun = prAgentApplyRunsBySession.get(sessionId);
  if (prAgentApplyRun) {
    prAgentApplyRunsBySession.delete(sessionId);
    console.warn("Agent review apply session failed:", error);
    return;
  }
  const taskRun = taskRunsBySession.get(sessionId);
  if (taskRun) {
    if (taskRun.action === "execute") {
      taskRepository.appendRunOutput(taskRun.runId, `\n[error]\n${error}\n`);
    }
    if (taskRun.action !== "execute") {
      return;
    }
  }
  mainRPC?.send.sessionStream({
    sessionId,
    event: { type: "error", error: { message: error } },
  });
});

// ── RPC handlers ─────────────────────────────────────────────────

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {
      getSessions: async () => {
        if (!latestSnapshot) return [];
        return buildSessionList(latestSnapshot);
      },

      getTranscript: async ({ sessionId, transcriptPath }) => {
        // Use provided path (for historical sessions) or look up in snapshot
        const path = transcriptPath
          ?? latestSnapshot?.tasks.find((t) => t.sessionId === sessionId)?.transcriptPath;
        if (!path) return [];
        return readTranscript(path);
      },

      sendPrompt: async ({
        prompt,
        cwd,
        fullAccess,
        sessionId: resumeId,
        selectedFiles,
      }: {
        prompt: string;
        cwd: string;
        fullAccess?: boolean;
        sessionId?: string;
        selectedFiles?: string[];
      }) => {
        try {
          console.log("[rpc] sendPrompt", {
            cwd,
            resumeId: resumeId ?? null,
            selectedFiles: selectedFiles ?? [],
            prompt,
          });
          // Capture per-turn baseline before sending prompt.
          await beginTurnDiff(cwd, resumeId).catch(() => {});
          const sessionId = await sessions.spawn(
            prompt,
            cwd,
            fullAccess ?? true,
            resumeId,
            selectedFiles ?? []
          );
          await setTurnDiffSession(cwd, sessionId).catch(() => {});
          // Register the tempId immediately (will be updated to realId on resolve)
          approvals.registerSession(sessionId, fullAccess ?? true);
          sessionCwds.set(sessionId, cwd);
          await stages.add(cwd);
          return { sessionId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("sendPrompt failed:", msg);
          throw new Error(msg);
        }
      },

      sendFollowUp: async ({
        sessionId,
        text,
        fullAccess,
        selectedFiles,
      }: {
        sessionId: string;
        text: string;
        fullAccess?: boolean;
        selectedFiles?: string[];
      }) => {
        console.log("[rpc] sendFollowUp", {
          sessionId,
          selectedFiles: selectedFiles ?? [],
          text,
        });
        const cwd = resolveSessionCwd(sessionId);
        if (cwd) {
          await beginTurnDiff(cwd, sessionId).catch(() => {});
        }
        if (typeof fullAccess === "boolean") {
          approvals.setSessionFullAccess(sessionId, fullAccess);
        }
        await sessions.sendMessage(sessionId, text, selectedFiles ?? []);
      },

      respondPermission: async ({
        sessionId,
        toolUseId,
        allow,
      }: {
        sessionId: string;
        toolUseId: string;
        allow: boolean;
      }) => {
        await sessions.respondPermission(sessionId, toolUseId, allow);
      },

      respondToolApproval: async ({
        toolUseId,
        allow,
      }: {
        toolUseId: string;
        allow: boolean;
      }) => {
        approvals.respond(toolUseId, allow);
      },

      renameSession: async ({
        sessionId,
        newName,
      }: {
        sessionId: string;
        newName: string;
      }) => {
        await sessionNames.set(sessionId, newName);
      },

      killSession: async ({ sessionId }) => {
        sessions.kill(sessionId);
      },

      deleteSession: async ({
        sessionId,
        cwd,
        transcriptPath,
      }: {
        sessionId: string;
        cwd?: string;
        transcriptPath?: string;
      }) => {
        const guessedPaths = cwd ? guessTranscriptPaths(cwd, sessionId) : [];
        const resolvedPath = transcriptPath
          ?? latestSnapshot?.tasks.find((t) => t.sessionId === sessionId)?.transcriptPath
          ?? guessedPaths[0]
          ?? null;

        let deleted = false;
        let deletedPath: string | null = null;
        const candidates = new Set<string>();
        if (resolvedPath) candidates.add(resolvedPath);
        for (const guessed of guessedPaths) candidates.add(guessed);

        for (const candidate of candidates) {
          try {
            await unlink(candidate);
            deleted = true;
            deletedPath = candidate;
            break;
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              console.warn("Failed to delete transcript:", candidate, err);
            }
          }
        }

        await sessionNames.delete(sessionId).catch(() => {});
        await clearLastTurnDiffForSession(sessionId, cwd).catch((err) => {
          console.warn("Failed to clear persisted last-turn diff for session:", err);
        });
        return { deleted, transcriptPath: deletedPath ?? resolvedPath ?? null };
      },

      getSessionHistory: async ({ cwd }) => {
        const sessions = await listSessionsForStage(cwd);
        return sessions.filter((session) => !isHiddenTaskSession(session.sessionId, session.prompt));
      },

      getDiff: async ({ cwd, scope, sessionId }) => {
        return getDiff(cwd, scope ?? "all", sessionId);
      },

      getCommitDiff: async ({
        cwd,
        commitHash,
      }: {
        cwd: string;
        commitHash: string;
      }) => {
        const strategy = await getVcsStrategy(cwd);
        return strategy.getCommitDiff(cwd, commitHash);
      },

      getBranchHistory: async ({
        cwd,
        limit,
      }: {
        cwd: string;
        limit?: number;
      }) => {
        const strategy = await getVcsStrategy(cwd);
        return strategy.getBranchHistory(cwd, limit);
      },

      getVcsInfo: async ({ cwd }: { cwd: string }) => {
        return getVcsInfo(cwd);
      },

      getCommitContext: async ({ cwd }: { cwd: string }) => {
        return getCommitContext(cwd);
      },

      generateCommitMessage: async ({
        cwd,
        includeUnstaged,
      }: {
        cwd: string;
        includeUnstaged?: boolean;
      }) => {
        const message = await generateCommitMessage(cwd, includeUnstaged ?? true);
        return { message };
      },

      performCommit: async ({
        cwd,
        message,
        includeUnstaged,
        mode,
      }: {
        cwd: string;
        message: string;
        includeUnstaged?: boolean;
        mode?: "commit" | "commit_and_push";
      }) => {
        return performCommit(cwd, message, includeUnstaged ?? true, mode ?? "commit");
      },

      getStages: async () => {
        await stages.load();
        return stages.getAll();
      },

      getSessionNames: async () => {
        return sessionNames.getAll();
      },

      getStageFiles: async ({ cwd }: { cwd: string }) => {
        if (!cwd) return [];
        return getStageFiles(cwd);
      },

      getFileContent: async ({
        cwd,
        path,
        maxBytes,
      }: {
        cwd: string;
        path: string;
        maxBytes?: number;
      }) => {
        return getStageFileContent(cwd, path, maxBytes);
      },

      getSlashCommands: async ({ cwd }: { cwd: string }) => {
        if (!cwd) return [];
        return getSlashCommands(cwd);
      },

      getInstalledPlugins: async () => {
        return getInstalledPlugins();
      },

      getStageTasks: async ({
        stagePath,
      }: {
        stagePath: string;
      }) => {
        assertTasksInstrumentUsable();
        if (!stagePath) return [];
        return taskRepository.listStageTasks(stagePath);
      },

      getTaskDetail: async ({ taskId }: { taskId: string }) => {
        assertTasksInstrumentUsable();
        if (!taskId) return null;
        return taskRepository.getTaskDetail(taskId);
      },

      createTask: async ({
        stagePath,
        title,
        notes,
      }: {
        stagePath: string;
        title?: string;
        notes?: string;
      }) => {
        assertTasksInstrumentUsable();
        const task = taskRepository.createTask(stagePath, title, notes);
        notifyTasksChanged(task.stagePath, task.id);
        return task;
      },

      updateTask: async ({
        taskId,
        patch,
      }: {
        taskId: string;
        patch: {
          title?: string;
          notes?: string;
          status?: TaskCardStatus;
          planMarkdown?: string | null;
        };
      }) => {
        assertTasksInstrumentUsable();
        if (!taskId) return null;
        const task = taskRepository.updateTask(taskId, patch);
        if (task) {
          notifyTasksChanged(task.stagePath, task.id);
        }
        return task;
      },

      deleteTask: async ({ taskId }: { taskId: string }) => {
        assertTasksInstrumentUsable();
        const stagePath = taskRepository.getTaskDetail(taskId)?.stagePath ?? null;
        taskRepository.deleteTask(taskId);
        if (stagePath) {
          notifyTasksChanged(stagePath);
        }
      },

      addTaskSource: async ({
        taskId,
        kind,
        url,
        content,
      }: {
        taskId: string;
        kind: TaskSourceKind;
        url?: string | null;
        content?: string | null;
      }) => {
        assertTasksInstrumentUsable();
        let source = taskRepository.addTaskSource(
          taskId,
          kind,
          url ?? null,
          content ?? null
        );

        if (source.url) {
          const fetched = await taskRepository.fetchTaskSource(source.id);
          if (fetched) source = fetched;
        }

        const task = taskRepository.getTaskDetail(taskId);
        if (task) {
          notifyTasksChanged(task.stagePath, task.id);
        }
        return source;
      },

      updateTaskSource: async ({
        sourceId,
        patch,
      }: {
        sourceId: string;
        patch: {
          title?: string | null;
          content?: string | null;
          url?: string | null;
        };
      }) => {
        assertTasksInstrumentUsable();
        let source = taskRepository.updateTaskSource(sourceId, patch);
        if (source && patch.url !== undefined && patch.url !== null && patch.url.trim()) {
          const fetched = await taskRepository.fetchTaskSource(source.id);
          if (fetched) source = fetched;
        }

        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) {
            notifyTasksChanged(task.stagePath, task.id);
          }
        }
        return source;
      },

      removeTaskSource: async ({ sourceId }: { sourceId: string }) => {
        assertTasksInstrumentUsable();
        const source = taskRepository.getTaskSource(sourceId);
        taskRepository.removeTaskSource(sourceId);
        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) notifyTasksChanged(task.stagePath, task.id);
        }
      },

      fetchTaskSource: async ({ sourceId }: { sourceId: string }) => {
        assertTasksInstrumentUsable();
        const source = await taskRepository.fetchTaskSource(sourceId);
        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) {
            notifyTasksChanged(task.stagePath, task.id);
          }
        }
        return source;
      },

      runTaskAction: async ({
        taskId,
        action,
      }: {
        taskId: string;
        action: TaskAction;
      }) => {
        return runTaskActionInternal(taskId, action);
      },

      getTaskRuns: async ({
        taskId,
        limit,
      }: {
        taskId: string;
        limit?: number;
      }) => {
        assertTasksInstrumentUsable();
        return taskRepository.getTaskRuns(taskId, limit ?? 20);
      },

      getStageConnectors: async ({
        stagePath,
      }: {
        stagePath: string;
      }) => {
        if (!stagePath) return [];
        return connectors.listStageConnectors(stagePath);
      },

      startConnectorAuth: async ({
        stagePath,
        provider,
      }: {
        stagePath: string;
        provider: ConnectorProvider;
      }) => {
        return connectors.startConnectorAuth(stagePath, provider);
      },

      getConnectorAuthStatus: async ({
        authSessionId,
      }: {
        authSessionId: string;
      }) => {
        return connectors.getConnectorAuthStatus(authSessionId);
      },

      disconnectStageConnector: async ({
        stagePath,
        provider,
      }: {
        stagePath: string;
        provider: ConnectorProvider;
      }) => {
        await connectors.disconnectStageConnector(stagePath, provider);
      },

      getAssignedPullRequests: async ({ limit }: { limit?: number }) => {
        return getAssignedPullRequests(limit);
      },

      getOpenedPullRequests: async ({ limit }: { limit?: number }) => {
        return getOpenedPullRequests(limit);
      },

      getReviewRequestedPullRequests: async ({ limit }: { limit?: number }) => {
        return getReviewRequestedPullRequests(limit);
      },

      getPullRequestDetail: async ({
        repo,
        number,
      }: {
        repo: string;
        number: number;
      }) => {
        return getPullRequestDetail(repo, number);
      },

      getPullRequestDiff: async ({
        repo,
        number,
        commitSha,
      }: {
        repo: string;
        number: number;
        commitSha?: string | null;
      }) => {
        return getPullRequestDiff(repo, number, commitSha ?? null);
      },

      getPullRequestReviewState: async ({
        repo,
        number,
      }: {
        repo: string;
        number: number;
      }) => {
        return prReviewStore.get(repo, number);
      },

      setPullRequestFileSeen: async ({
        repo,
        number,
        headSha,
        filePath,
        fileSha,
        seen,
      }: {
        repo: string;
        number: number;
        headSha: string;
        filePath: string;
        fileSha: string | null;
        seen: boolean;
      }) => {
        return prReviewStore.setFileSeen({
          repo,
          number,
          headSha,
          filePath,
          fileSha,
          seen,
        });
      },

      markPullRequestFilesSeen: async ({
        repo,
        number,
        headSha,
        files,
      }: {
        repo: string;
        number: number;
        headSha: string;
        files: Array<{ path: string; sha: string | null }>;
      }) => {
        return prReviewStore.markFilesSeen({
          repo,
          number,
          headSha,
          files,
        });
      },

      replyPullRequestReviewComment: async ({
        repo,
        number,
        commentId,
        body,
      }: {
        repo: string;
        number: number;
        commentId: string;
        body: string;
      }) => {
        await replyPullRequestReviewComment(repo, number, commentId, body);
      },

      createPullRequestReviewComment: async ({
        repo,
        number,
        commitSha,
        path,
        line,
        side,
        body,
      }: {
        repo: string;
        number: number;
        commitSha: string;
        path: string;
        line: number;
        side: "LEFT" | "RIGHT";
        body: string;
      }) => {
        await createPullRequestReviewComment(repo, number, {
          commitSha,
          path,
          line,
          side,
          body,
        });
      },

      getPullRequestAgentReviews: async ({
        repo,
        number,
      }: {
        repo: string;
        number: number;
      }) => {
        await prAgentReviewStore.importExistingFiles(repo, number);
        return prAgentReviewStore.listRuns(repo, number);
      },

      getPullRequestAgentReviewDocument: async ({
        repo,
        number,
        version,
      }: {
        repo: string;
        number: number;
        version: number;
      }) => {
        await prAgentReviewStore.importExistingFiles(repo, number);
        const run = await prAgentReviewStore.getRunByVersion(repo, number, version);
        if (!run) return null;
        return prAgentReviewProvider.getDocument(run);
      },

      startPullRequestAgentReview: async ({
        repo,
        number,
        headSha,
      }: {
        repo: string;
        number: number;
        headSha: string;
      }) => {
        const normalizedRepo = String(repo ?? "").trim();
        const normalizedNumber = Math.max(1, Math.trunc(number));
        const normalizedHeadSha = String(headSha ?? "").trim();
        if (!normalizedRepo || !Number.isFinite(normalizedNumber)) {
          throw new Error("Invalid pull request selection");
        }

        const run = await prAgentReviewStore.startRun({
          repo: normalizedRepo,
          number: normalizedNumber,
          headSha: normalizedHeadSha,
        });

        try {
          await prAgentReviewProvider.writePlaceholder(run);
          const cwdResolution = await prAgentReviewProvider.resolveCwd(
            normalizedRepo
          );
          const prompt = prAgentReviewProvider.buildPrompt({
            repo: normalizedRepo,
            number: normalizedNumber,
            headSha: normalizedHeadSha,
            outputFilePath: run.filePath,
            cwdSource: cwdResolution.source,
            stagePath: cwdResolution.stagePath,
          });

          const sessionId = await sessions.spawn(
            prompt,
            cwdResolution.cwd,
            true
          );

          prAgentRunsBySession.set(sessionId, {
            runId: run.id,
            repo: normalizedRepo,
            number: normalizedNumber,
          });
          const updatedRun = await prAgentReviewStore.bindSessionId(run.id, sessionId);
          const resolvedRun = updatedRun ?? run;
          notifyPullRequestAgentReviewChanged(resolvedRun);
          return resolvedRun;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await prAgentReviewProvider.writeFailedDocument(run, message).catch((err) => {
            console.warn("Failed to write agent review error document:", err);
          });
          const failedRun = await prAgentReviewStore.markFailed(
            run.id,
            message,
            "failed"
          );
          const resolvedRun = failedRun ?? run;
          notifyPullRequestAgentReviewChanged(resolvedRun);
          return resolvedRun;
        }
      },

      applyPullRequestAgentReviewIssue: async ({
        repo,
        number,
        reviewVersion,
        suggestionIndex,
      }: {
        repo: string;
        number: number;
        reviewVersion: number;
        suggestionIndex: number;
      }) => {
        const normalizedRepo = String(repo ?? "").trim();
        const normalizedNumber = Math.max(1, Math.trunc(number));
        const normalizedReviewVersion = Math.max(1, Math.trunc(reviewVersion));
        const normalizedSuggestionIndex = Math.trunc(suggestionIndex);

        if (!normalizedRepo || !Number.isFinite(normalizedNumber)) {
          throw new Error("Invalid pull request selection");
        }
        if (!Number.isFinite(normalizedSuggestionIndex) || normalizedSuggestionIndex < 0) {
          throw new Error("Invalid suggestion index");
        }

        const run = await prAgentReviewStore.getRunByVersion(
          normalizedRepo,
          normalizedNumber,
          normalizedReviewVersion
        );
        if (!run) {
          throw new Error("Agent review version not found");
        }

        const document = await prAgentReviewProvider.getDocument(run);
        if (!document || !document.review) {
          throw new Error(document?.parseError || "Agent review JSON is invalid");
        }

        const suggestion = document.review.suggestions[normalizedSuggestionIndex] ?? null;
        if (!suggestion) {
          throw new Error("Suggestion not found");
        }
        if (suggestion.applied) {
          throw new Error("Suggestion is already applied");
        }

        const prompt = buildPullRequestAgentApplyPrompt({
          repo: normalizedRepo,
          number: normalizedNumber,
          headSha: run.headSha,
          reviewVersion: normalizedReviewVersion,
          suggestionIndex: normalizedSuggestionIndex,
          suggestionLevel: suggestion.level,
          suggestionTitle: suggestion.title,
          suggestionReason: suggestion.reason,
          suggestionSolutions: suggestion.solutions,
          suggestionBenefit: suggestion.benefit,
        });

        const sessionId = await sessions.spawn(
          prompt,
          homedir(),
          true
        );

        prAgentApplyRunsBySession.set(sessionId, {
          runId: run.id,
          repo: normalizedRepo,
          number: normalizedNumber,
          reviewVersion: normalizedReviewVersion,
          suggestionIndex: normalizedSuggestionIndex,
        });

        return { sessionId };
      },

      addStage: async ({ path }) => {
        await stages.add(path);
        invalidateStageFilesCache(path);
        invalidateSlashCommandsCache(path);
        invalidateInstalledPluginsCache();
      },

      removeStage: async ({ path }) => {
        await stages.remove(path);
        await clearLastTurnDiffForStage(path).catch((err) => {
          console.warn("Failed to clear stage diff state:", err);
        });
        invalidateVcsCache(path);
        invalidateStageFilesCache(path);
        invalidateSlashCommandsCache(path);
        invalidateInstalledPluginsCache();
      },

      openInFinder: async ({ path }: { path: string }) => {
        if (!path) return;
        try {
          const proc = Bun.spawn(["open", path], {
            stdout: "ignore",
            stderr: "pipe",
          });
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new Error(stderr || `Failed to open path in Finder (${exitCode})`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(msg);
        }
      },

      openExternalUrl: async ({ url }: { url: string }) => {
        const normalized = String(url ?? "").trim();
        if (!normalized) return;
        if (!/^https?:\/\//i.test(normalized)) {
          throw new Error("Only http(s) URLs are allowed");
        }
        try {
          const proc = Bun.spawn(["open", normalized], {
            stdout: "ignore",
            stderr: "pipe",
          });
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new Error(stderr || `Failed to open URL (${exitCode})`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(msg);
        }
      },

      pickDirectory: async () => {
        // Use osascript to open native directory picker on macOS
        try {
          const proc = Bun.spawn([
            "osascript",
            "-e",
            'set theFolder to choose folder with prompt "Select stage directory"',
            "-e",
            'return POSIX path of theFolder',
          ], { stdout: "pipe", stderr: "pipe" });

          const output = await new Response(proc.stdout).text();
          const exitCode = await proc.exited;

          if (exitCode !== 0) return null;
          const dirPath = output.trim().replace(/\/$/, "");
          return dirPath || null;
        } catch {
          return null;
        }
      },

      listInstruments: async () => {
        return instrumentRuntime.list();
      },

      installInstrumentFromPath: async ({ path }: { path: string }) => {
        const normalized = String(path ?? "").trim();
        if (!normalized) {
          throw new Error("Instrument path is required");
        }
        return instrumentRuntime.installFromPath(normalized);
      },

      setInstrumentEnabled: async ({
        instrumentId,
        enabled,
      }: {
        instrumentId: string;
        enabled: boolean;
      }) => {
        const id = String(instrumentId ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        return instrumentRuntime.setEnabled(id, Boolean(enabled));
      },

      removeInstrument: async ({
        instrumentId,
        deleteData,
      }: {
        instrumentId: string;
        deleteData?: boolean;
      }) => {
        const id = String(instrumentId ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        return instrumentRuntime.remove(id, { deleteData: Boolean(deleteData) });
      },

      instrumentStorageGetProperty: async ({
        instrumentId,
        key,
      }: {
        instrumentId: string;
        key: string;
      }) => {
        const value = await instrumentRuntime.getProperty(instrumentId, key);
        return { value };
      },

      instrumentStorageSetProperty: async ({
        instrumentId,
        key,
        value,
      }: {
        instrumentId: string;
        key: string;
        value: unknown;
      }) => {
        await instrumentRuntime.setProperty(instrumentId, key, value);
      },

      instrumentStorageDeleteProperty: async ({
        instrumentId,
        key,
      }: {
        instrumentId: string;
        key: string;
      }) => {
        await instrumentRuntime.deleteProperty(instrumentId, key);
      },

      instrumentStorageReadFile: async ({
        instrumentId,
        path,
        encoding,
      }: {
        instrumentId: string;
        path: string;
        encoding?: "utf8" | "base64";
      }) => {
        const normalizedEncoding = encoding === "base64" ? "base64" : "utf8";
        const content = await instrumentRuntime.readFile(
          instrumentId,
          path,
          normalizedEncoding
        );
        return { content, encoding: normalizedEncoding };
      },

      instrumentStorageWriteFile: async ({
        instrumentId,
        path,
        content,
        encoding,
      }: {
        instrumentId: string;
        path: string;
        content: string;
        encoding?: "utf8" | "base64";
      }) => {
        await instrumentRuntime.writeFile(
          instrumentId,
          path,
          content,
          encoding === "base64" ? "base64" : "utf8"
        );
      },

      instrumentStorageDeleteFile: async ({
        instrumentId,
        path,
      }: {
        instrumentId: string;
        path: string;
      }) => {
        await instrumentRuntime.deleteFile(instrumentId, path);
      },

      instrumentStorageListFiles: async ({
        instrumentId,
        dir,
      }: {
        instrumentId: string;
        dir?: string;
      }) => {
        return instrumentRuntime.listFiles(instrumentId, dir);
      },

      instrumentStorageSqlQuery: async ({
        instrumentId,
        db,
        sql,
        params,
      }: {
        instrumentId: string;
        db?: string;
        sql: string;
        params?: unknown[];
      }) => {
        const rows = await instrumentRuntime.sqlQuery(instrumentId, sql, params, db);
        return { rows };
      },

      instrumentStorageSqlExecute: async ({
        instrumentId,
        db,
        sql,
        params,
      }: {
        instrumentId: string;
        db?: string;
        sql: string;
        params?: unknown[];
      }) => {
        return instrumentRuntime.sqlExecute(instrumentId, sql, params, db);
      },

      instrumentInvoke: async ({
        instrumentId,
        method,
        params,
      }: {
        instrumentId: string;
        method: string;
        params?: Record<string, unknown>;
      }) => {
        if (instrumentId === TASKS_INSTRUMENT_ID && method === "retryMigration") {
          const result = await retryTasksMigration();
          return { result };
        }
        const result = await instrumentRuntime.invoke(instrumentId, method, params);
        return { result };
      },

      logClient: async ({
        ts,
        level,
        message,
        meta,
      }: {
        ts?: string;
        level: "debug" | "info" | "warn" | "error";
        message: string;
        meta?: unknown;
      }) => {
        const at = typeof ts === "string" ? ts : new Date().toISOString();
        const lvl = String(level ?? "info").toLowerCase();
        let detail = "";
        if (meta != null) {
          if (typeof meta === "string") {
            detail = ` ${meta}`;
          } else {
            try {
              detail = ` ${JSON.stringify(meta)}`;
            } catch {
              detail = ` ${String(meta)}`;
            }
          }
        }
        const line = `[${at}] [mainview:${lvl}] ${String(message ?? "")}${detail}`;
        if (lvl === "error") console.error(line);
        else if (lvl === "warn") console.warn(line);
        else console.log(line);
        writeMainviewLogLine(line);
      },
    },
    messages: {
      "*": (messageName: string | number | symbol, payload: unknown) => {
        if (String(messageName) === "clientLog") {
          const event = (payload ?? {}) as {
            ts?: unknown;
            level?: unknown;
            message?: unknown;
            meta?: unknown;
          };
          const ts = typeof event.ts === "string" ? event.ts : new Date().toISOString();
          const level = typeof event.level === "string" ? event.level.toLowerCase() : "info";
          const message = typeof event.message === "string" ? event.message : String(event.message ?? "");
          let meta = "";
          if (event.meta != null) {
            if (typeof event.meta === "string") {
              meta = ` ${event.meta}`;
            } else {
              try {
                meta = ` ${JSON.stringify(event.meta)}`;
              } catch {
                meta = ` ${String(event.meta)}`;
              }
            }
          }
          const line = `[${ts}] [mainview:${level}] ${message}${meta}`;
          console.log(line);
          writeMainviewLogLine(line);
          return;
        }
        console.log(`WebView message: ${String(messageName)}`, payload);
      },
    } as any,
  },
});

async function handleSessionEvent(sessionId: string, event: any): Promise<void> {
  const prAgentRun = prAgentRunsBySession.get(sessionId);
  if (prAgentRun) {
    const consumed = await finalizeAgentReviewRunFromEvent(
      sessionId,
      prAgentRun,
      event
    );
    if (consumed) {
      return;
    }
    // Agent review sessions are background-only and should not stream to chat.
    return;
  }

  const prAgentApplyRun = prAgentApplyRunsBySession.get(sessionId);
  if (prAgentApplyRun) {
    const consumed = await finalizeAgentReviewApplyFromEvent(
      sessionId,
      prAgentApplyRun,
      event
    );
    if (consumed) {
      return;
    }
    // Agent review apply sessions are background-only and should not stream to chat.
    return;
  }

  const taskRun = taskRunsBySession.get(sessionId);
  if (taskRun && taskRun.action === "execute") {
    const chunk = extractTaskRunOutput(event);
    if (chunk) {
      taskRepository.appendRunOutput(taskRun.runId, chunk);
    }
  }

  if (event?.type === "result" && event?.subtype === "success") {
    if (!taskRun || taskRun.action === "execute") {
      const cwd = resolveSessionCwd(sessionId);
      if (cwd) {
        await finalizeTurnDiff(cwd, sessionId).catch((err) => {
          console.warn("Failed to finalize turn diff:", err);
        });
      }
    }
  }

  if (taskRun && taskRun.action === "execute") {
    finalizeExecuteTaskRunFromEvent(sessionId, taskRun, event);
  }

  if (taskRun && taskRun.action !== "execute") {
    const consumed = finalizeBackgroundTaskRunFromEvent(sessionId, taskRun, event);
    if (consumed) {
      return;
    }
  }

  if (taskRun && taskRun.action !== "execute") {
    return;
  }

  mainRPC?.send.sessionStream({ sessionId, event });
}

function resolveSessionCwd(sessionId: string): string | null {
  const direct = sessionCwds.get(sessionId);
  if (direct) return direct;

  const fromSnapshot = latestSnapshot?.tasks.find((t) => t.sessionId === sessionId)?.cwd ?? null;
  return fromSnapshot;
}

function guessTranscriptPaths(cwd: string, sessionId: string): string[] {
  const variants = getStagePathVariantsSync(cwd);
  const paths = new Set<string>();
  for (const variant of variants) {
    const encoded = encodeClaudeProjectPath(variant);
    const legacy = encodeClaudeProjectPathLegacy(variant);
    paths.add(join(homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`));
    paths.add(join(homedir(), ".claude", "projects", legacy, `${sessionId}.jsonl`));
  }
  return Array.from(paths);
}

function notifyTasksChanged(stagePath: string, taskId?: string): void {
  if (!stagePath) return;
  mainRPC?.send.instrumentEvent({
    instrumentId: TASKS_INSTRUMENT_ID,
    event: "tasks.changed",
    payload: { stagePath, taskId: taskId ?? null },
  });
}

function assertTasksInstrumentUsable(): InstrumentRegistryEntry {
  const entry = instrumentRuntime.get(TASKS_INSTRUMENT_ID);
  if (!entry) {
    throw new Error("Tasks instrument is not installed");
  }
  if (!entry.enabled || entry.status === "disabled") {
    throw new Error("Tasks instrument is disabled");
  }
  if (entry.status === "blocked") {
    throw new Error(
      entry.lastError
        ? `Tasks instrument is blocked: ${entry.lastError}`
        : "Tasks instrument is blocked"
    );
  }
  return entry;
}

async function persistTasksMigrationMarker(
  state: TasksMigrationState
): Promise<void> {
  if (!state.completedAt) return;
  const entry = instrumentRuntime.get(TASKS_INSTRUMENT_ID);
  if (!entry?.enabled || entry.status === "blocked") return;
  await instrumentRuntime.setProperty(
    TASKS_INSTRUMENT_ID,
    TASKS_MIGRATION_MARKER_KEY,
    {
      completedAt: state.completedAt,
      backupPath: state.backupPath,
      sourcePath: LEGACY_TASKS_DB_PATH,
      targetPath: TASKS_INSTRUMENT_DB_PATH,
    }
  );
}

async function initializeInstrumentRuntime(): Promise<void> {
  try {
    await instrumentRuntime.load();
  } catch (err) {
    console.warn("Failed to load instruments runtime:", err);
    return;
  }

  const tasksEntry = instrumentRuntime.get(TASKS_INSTRUMENT_ID);
  if (!tasksEntry) return;

  if (tasksMigrationState.blocked) {
    await instrumentRuntime.markBlocked(
      TASKS_INSTRUMENT_ID,
      tasksMigrationState.error ?? "Tasks data migration failed"
    ).catch((err) => {
      console.warn("Failed to mark Tasks instrument as blocked:", err);
    });
    return;
  }

  await instrumentRuntime.clearError(TASKS_INSTRUMENT_ID).catch((err) => {
    console.warn("Failed to clear Tasks instrument error state:", err);
  });

  await persistTasksMigrationMarker(tasksMigrationState).catch((err) => {
    console.warn("Failed to persist Tasks migration marker:", err);
  });
}

async function retryTasksMigration(): Promise<{
  ok: boolean;
  blocked: boolean;
  error: string | null;
}> {
  tasksMigrationState = migrateLegacyTasksDbSync();

  if (tasksMigrationState.blocked) {
    await instrumentRuntime.markBlocked(
      TASKS_INSTRUMENT_ID,
      tasksMigrationState.error ?? "Tasks data migration failed"
    ).catch((err) => {
      console.warn("Failed to update Tasks blocked state:", err);
    });
    return {
      ok: false,
      blocked: true,
      error: tasksMigrationState.error ?? "Tasks data migration failed",
    };
  }

  await instrumentRuntime.clearError(TASKS_INSTRUMENT_ID).catch((err) => {
    console.warn("Failed to clear Tasks blocked state:", err);
  });

  await persistTasksMigrationMarker(tasksMigrationState).catch((err) => {
    console.warn("Failed to persist Tasks migration marker:", err);
  });

  return {
    ok: true,
    blocked: false,
    error: null,
  };
}

async function runTaskActionInternal(
  taskId: string,
  action: TaskAction
): Promise<{ runId: string; sessionId: string | null }> {
  assertTasksInstrumentUsable();

  const prepared = taskRepository.prepareTaskRun(taskId, action);
  notifyTasksChanged(prepared.stagePath, prepared.task.id);

  let sessionId: string | null = null;
  try {
    if (action === "execute") {
      await beginTurnDiff(prepared.stagePath).catch(() => {});
    }

    const tempSessionId = await sessions.spawn(
      prepared.prompt,
      prepared.stagePath,
      true,
      undefined,
      [],
      action === "improve"
        ? IMPROVE_TASK_MODEL
        : action === "plan"
          ? PLAN_TASK_MODEL
          : undefined,
      action === "execute" ? undefined : []
    );
    sessionId = tempSessionId;
    if (action !== "execute") {
      addHiddenTaskSessionId(tempSessionId);
    }

    if (action === "execute") {
      await setTurnDiffSession(prepared.stagePath, tempSessionId).catch(() => {});
    }

    taskRepository.bindRunSession(prepared.run.id, tempSessionId);
    taskRunsBySession.set(tempSessionId, {
      runId: prepared.run.id,
      taskId: prepared.task.id,
      action,
      stagePath: prepared.stagePath,
    });
    sessionCwds.set(tempSessionId, prepared.stagePath);
    approvals.registerSession(tempSessionId, true);
    await stages.add(prepared.stagePath);
    notifyTasksChanged(prepared.stagePath, prepared.task.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    taskRepository.finalizeRun(prepared.run.id, {
      success: false,
      error: message,
    });
    notifyTasksChanged(prepared.stagePath, prepared.task.id);
    throw err;
  }

  return {
    runId: prepared.run.id,
    sessionId: action === "execute" ? sessionId : null,
  };
}

async function invokeTasksInstrument(
  _ctx: InstrumentBackendContext,
  method: string,
  params: Record<string, unknown> | undefined
): Promise<unknown> {
  const payload = params ?? {};

  if (method === "retryMigration") {
    return retryTasksMigration();
  }

  assertTasksInstrumentUsable();

  switch (method) {
    case "listStageTasks": {
      const stagePath = String(payload.stagePath ?? "").trim();
      if (!stagePath) return [];
      return taskRepository.listStageTasks(stagePath);
    }
    case "getTaskDetail": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) return null;
      return taskRepository.getTaskDetail(taskId);
    }
    case "createTask": {
      const stagePath = String(payload.stagePath ?? "").trim();
      const title = payload.title == null ? undefined : String(payload.title);
      const notes = payload.notes == null ? undefined : String(payload.notes);
      if (!stagePath) {
        throw new Error("stagePath is required");
      }
      const task = taskRepository.createTask(stagePath, title, notes);
      notifyTasksChanged(task.stagePath, task.id);
      return task;
    }
    case "updateTask": {
      const taskId = String(payload.taskId ?? "").trim();
      const patch = (payload.patch ?? {}) as {
        title?: string;
        notes?: string;
        status?: TaskCardStatus;
        planMarkdown?: string | null;
      };
      if (!taskId) return null;
      const task = taskRepository.updateTask(taskId, patch);
      if (task) {
        notifyTasksChanged(task.stagePath, task.id);
      }
      return task;
    }
    case "deleteTask": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) return null;
      const stagePath = taskRepository.getTaskDetail(taskId)?.stagePath ?? null;
      taskRepository.deleteTask(taskId);
      if (stagePath) {
        notifyTasksChanged(stagePath);
      }
      return { deleted: true };
    }
    case "addTaskSource": {
      const taskId = String(payload.taskId ?? "").trim();
      const kind = String(payload.kind ?? "").trim() as TaskSourceKind;
      const url = payload.url == null ? null : String(payload.url);
      const content = payload.content == null ? null : String(payload.content);
      if (!taskId) throw new Error("taskId is required");
      let source = taskRepository.addTaskSource(taskId, kind, url, content);

      if (source.url) {
        const fetched = await taskRepository.fetchTaskSource(source.id);
        if (fetched) source = fetched;
      }

      const task = taskRepository.getTaskDetail(taskId);
      if (task) {
        notifyTasksChanged(task.stagePath, task.id);
      }
      return source;
    }
    case "updateTaskSource": {
      const sourceId = String(payload.sourceId ?? "").trim();
      const patch = (payload.patch ?? {}) as {
        title?: string | null;
        content?: string | null;
        url?: string | null;
      };
      if (!sourceId) return null;
      let source = taskRepository.updateTaskSource(sourceId, patch);
      if (source && patch.url !== undefined && patch.url !== null && patch.url.trim()) {
        const fetched = await taskRepository.fetchTaskSource(source.id);
        if (fetched) source = fetched;
      }

      if (source) {
        const task = taskRepository.getTaskDetail(source.taskId);
        if (task) {
          notifyTasksChanged(task.stagePath, task.id);
        }
      }
      return source;
    }
    case "removeTaskSource": {
      const sourceId = String(payload.sourceId ?? "").trim();
      if (!sourceId) return { removed: false };
      const source = taskRepository.getTaskSource(sourceId);
      taskRepository.removeTaskSource(sourceId);
      if (source) {
        const task = taskRepository.getTaskDetail(source.taskId);
        if (task) notifyTasksChanged(task.stagePath, task.id);
      }
      return { removed: true };
    }
    case "fetchTaskSource": {
      const sourceId = String(payload.sourceId ?? "").trim();
      if (!sourceId) return null;
      const source = await taskRepository.fetchTaskSource(sourceId);
      if (source) {
        const task = taskRepository.getTaskDetail(source.taskId);
        if (task) notifyTasksChanged(task.stagePath, task.id);
      }
      return source;
    }
    case "runTaskAction": {
      const taskId = String(payload.taskId ?? "").trim();
      const action = String(payload.action ?? "").trim() as TaskAction;
      if (!taskId) {
        throw new Error("taskId is required");
      }
      return runTaskActionInternal(taskId, action);
    }
    case "getTaskRuns": {
      const taskId = String(payload.taskId ?? "").trim();
      const limit = Number(payload.limit ?? 20);
      return taskRepository.getTaskRuns(taskId, Number.isFinite(limit) ? limit : 20);
    }
    case "listStageConnectors": {
      const stagePath = String(payload.stagePath ?? "").trim();
      if (!stagePath) return [];
      return connectors.listStageConnectors(stagePath);
    }
    case "startConnectorAuth": {
      const stagePath = String(payload.stagePath ?? "").trim();
      const provider = String(payload.provider ?? "").trim() as ConnectorProvider;
      return connectors.startConnectorAuth(stagePath, provider);
    }
    case "getConnectorAuthStatus": {
      const authSessionId = String(payload.authSessionId ?? "").trim();
      return connectors.getConnectorAuthStatus(authSessionId);
    }
    case "disconnectStageConnector": {
      const stagePath = String(payload.stagePath ?? "").trim();
      const provider = String(payload.provider ?? "").trim() as ConnectorProvider;
      await connectors.disconnectStageConnector(stagePath, provider);
      return null;
    }
    default:
      throw new Error(`Unsupported Tasks instrument method '${method}'`);
  }
}

function addHiddenTaskSessionId(sessionId: string | null | undefined): void {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) return;
  hiddenTaskSessionIds.add(normalized);
}

function remapHiddenTaskSessionId(tempId: string, realId: string): void {
  const prev = String(tempId ?? "").trim();
  const next = String(realId ?? "").trim();
  if (!prev || !next || prev === next) return;
  if (!hiddenTaskSessionIds.has(prev)) return;
  hiddenTaskSessionIds.delete(prev);
  hiddenTaskSessionIds.add(next);
}

function isHiddenTaskSessionId(sessionId: string | null | undefined): boolean {
  const normalized = String(sessionId ?? "").trim();
  if (!normalized) return false;
  return hiddenTaskSessionIds.has(normalized);
}

function isHiddenTaskPrompt(prompt: string | null | undefined): boolean {
  const normalized = String(prompt ?? "").trim();
  if (!normalized) return false;
  return HIDDEN_TASK_PROMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isHiddenTaskSession(
  sessionId: string | null | undefined,
  prompt?: string | null
): boolean {
  return isHiddenTaskSessionId(sessionId) || isHiddenTaskPrompt(prompt);
}

function filterSnapshotHiddenTaskSessions(snapshot: Snapshot): Snapshot {
  const tasks = snapshot.tasks.filter((task) => !isHiddenTaskSession(task.sessionId, task.prompt));
  const processes = snapshot.processes.filter((process) => {
    const task = process.task;
    return !isHiddenTaskSession(task?.sessionId, task?.prompt);
  });
  const subagents = snapshot.subagents.filter((subagent) => {
    if (isHiddenTaskSessionId(subagent.parentSessionId)) return false;
    if (isHiddenTaskSessionId(subagent.subagentSessionId)) return false;
    return true;
  });

  if (
    tasks.length === snapshot.tasks.length
    && processes.length === snapshot.processes.length
    && subagents.length === snapshot.subagents.length
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    tasks,
    processes,
    subagents,
  };
}

function notifyPullRequestAgentReviewChanged(run: PullRequestAgentReviewRun): void {
  mainRPC?.send.pullRequestAgentReviewChanged({
    repo: run.repo,
    number: run.number,
    runId: run.id,
    status: run.status,
  });
}

function clearAgentRunSessionBindings(runId: string): void {
  for (const [sessionId, run] of prAgentRunsBySession) {
    if (run.runId !== runId) continue;
    prAgentRunsBySession.delete(sessionId);
  }
}

function buildPullRequestAgentApplyPrompt(params: {
  repo: string;
  number: number;
  headSha: string;
  reviewVersion: number;
  suggestionIndex: number;
  suggestionLevel: string;
  suggestionTitle: string;
  suggestionReason: string;
  suggestionSolutions: string;
  suggestionBenefit: string;
}): string {
  const repo = String(params.repo ?? "").trim();
  const number = Math.max(1, Math.trunc(params.number));
  const headSha = String(params.headSha ?? "").trim();
  const reviewVersion = Math.max(1, Math.trunc(params.reviewVersion));
  const suggestionIndex = Math.max(0, Math.trunc(params.suggestionIndex));
  const suggestionLevel = String(params.suggestionLevel ?? "").trim() || "Unknown";
  const suggestionTitle = String(params.suggestionTitle ?? "").trim() || `Suggestion ${suggestionIndex + 1}`;
  const suggestionReason = String(params.suggestionReason ?? "").trim();
  const suggestionSolutions = String(params.suggestionSolutions ?? "").trim();
  const suggestionBenefit = String(params.suggestionBenefit ?? "").trim();
  const safeIssueSummary = collapseWhitespace(suggestionTitle).slice(0, 120);

  return [
    "Apply one actionable item from an Agent Review to a pull request branch.",
    "Use a temporary clone only. Do not modify any existing local stage clone.",
    "",
    `Repository: ${repo}`,
    `PR: #${number}`,
    `Head SHA: ${headSha || "(unknown)"}`,
    `Agent Review Version: v${reviewVersion}`,
    `Suggestion Index: ${suggestionIndex}`,
    `Suggestion Level: ${suggestionLevel}`,
    "",
    "Suggestion:",
    `Title: ${suggestionTitle}`,
    "Why:",
    suggestionReason || "(not provided)",
    "Solution/Solutions:",
    suggestionSolutions || "(not provided)",
    "Benefit:",
    suggestionBenefit || "(not provided)",
    "",
    "Requirements:",
    "1. Create a temporary directory with `mktemp -d` and ensure cleanup at the end.",
    `2. Clone the repo in that temp directory (for example with \`gh repo clone ${repo}\`).`,
    `3. Checkout the PR branch (prefer \`gh pr checkout ${number} -R ${repo}\`, fallback to git fetch/checkout).`,
    "4. Implement only this issue fix; keep scope tight.",
    "5. Run targeted validation (tests/lint/build) relevant to the change when possible.",
    `6. Commit with message: \`fix(pr #${number}): apply agent review v${reviewVersion} - ${safeIssueSummary}\``,
    "7. Push the commit to the PR branch.",
    "8. Remove the temporary clone directory before exiting.",
    "9. Return a short summary with changed files, commit hash, and push status.",
  ].join("\n");
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function finalizeAgentReviewRunFromEvent(
  sessionId: string,
  runRef: {
    runId: string;
    repo: string;
    number: number;
  },
  event: unknown
): Promise<boolean> {
  if (!event || typeof event !== "object") return false;
  const ev = event as Record<string, any>;
  if (ev.type !== "result") return false;

  const isSuccess = ev.subtype === "success" && !Boolean(ev.is_error);
  const isFailure = ev.subtype === "error" || (ev.subtype === "success" && Boolean(ev.is_error));
  if (!isSuccess && !isFailure) return false;

  const run = await prAgentReviewStore.getRunById(runRef.runId);
  if (!run) {
    clearAgentRunSessionBindings(runRef.runId);
    sessions.kill(sessionId);
    return true;
  }

  try {
    if (isSuccess) {
      const resultText = String(ev.result ?? "").trim();
      try {
        await prAgentReviewProvider.ensureCompletedDocument(run, resultText);
        const completedRun = await prAgentReviewStore.markCompleted(run.id);
        if (completedRun) {
          notifyPullRequestAgentReviewChanged(completedRun);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prAgentReviewProvider.writeFailedDocument(run, message).catch((err) => {
          console.warn("Failed to write failed agent review document:", err);
        });
        const failedRun = await prAgentReviewStore.markFailed(run.id, message, "failed");
        if (failedRun) {
          notifyPullRequestAgentReviewChanged(failedRun);
        }
      }
    } else {
      const message = String(
        ev.error?.message
          ?? ev.result
          ?? "Agent review failed"
      ).trim() || "Agent review failed";
      await prAgentReviewProvider.writeFailedDocument(run, message).catch((err) => {
        console.warn("Failed to write failed agent review document:", err);
      });
      const failedRun = await prAgentReviewStore.markFailed(run.id, message, "failed");
      if (failedRun) {
        notifyPullRequestAgentReviewChanged(failedRun);
      }
    }
  } catch (err) {
    console.warn("Failed to finalize agent review from result event:", err);
  } finally {
    clearAgentRunSessionBindings(run.id);
    sessions.kill(sessionId);
  }

  return true;
}

async function finalizeAgentReviewRunFromExit(
  runRef: {
    runId: string;
    repo: string;
    number: number;
  },
  exitCode: number
): Promise<void> {
  const run = await prAgentReviewStore.getRunById(runRef.runId);
  if (!run || run.status !== "running") return;

  const document = await prAgentReviewProvider.getDocument(run);
  const hasPlaceholder = isDocumentPlaceholder(document?.rawJson ?? null);

  if (!hasPlaceholder) {
    const completedRun = await prAgentReviewStore.markCompleted(run.id);
    if (completedRun) {
      notifyPullRequestAgentReviewChanged(completedRun);
    }
    return;
  }

  if (exitCode === 0) {
    const staleRun = await prAgentReviewStore.markFailed(
      run.id,
      "Interrupted before completion",
      "stale"
    );
    if (staleRun) {
      notifyPullRequestAgentReviewChanged(staleRun);
    }
    return;
  }

  await failAgentReviewRun(
    runRef,
    `Session exited with code ${exitCode}`,
    "failed"
  );
}

async function failAgentReviewRun(
  runRef: {
    runId: string;
    repo: string;
    number: number;
  },
  error: string,
  status: "failed" | "stale" = "failed"
): Promise<void> {
  const run = await prAgentReviewStore.getRunById(runRef.runId);
  if (!run || run.status !== "running") return;

  if (status === "failed") {
    await prAgentReviewProvider.writeFailedDocument(run, error).catch((err) => {
      console.warn("Failed to write failed agent review document:", err);
    });
  }

  const nextRun = await prAgentReviewStore.markFailed(run.id, error, status);
  if (nextRun) {
    notifyPullRequestAgentReviewChanged(nextRun);
  }

  for (const [sessionId, activeRun] of prAgentRunsBySession) {
    if (activeRun.runId !== run.id) continue;
    sessions.kill(sessionId);
  }
}

async function finalizeAgentReviewApplyFromEvent(
  sessionId: string,
  runRef: {
    runId: string;
    repo: string;
    number: number;
    reviewVersion: number;
    suggestionIndex: number;
  },
  event: unknown
): Promise<boolean> {
  if (!event || typeof event !== "object") return false;
  const ev = event as Record<string, any>;
  if (ev.type !== "result") return false;

  const isSuccess = ev.subtype === "success" && !Boolean(ev.is_error);
  const isFailure = ev.subtype === "error" || (ev.subtype === "success" && Boolean(ev.is_error));
  if (!isSuccess && !isFailure) return false;

  prAgentApplyRunsBySession.delete(sessionId);

  if (isSuccess) {
    try {
      const run = await prAgentReviewStore.getRunById(runRef.runId);
      if (run) {
        await prAgentReviewProvider.markSuggestionApplied(
          run,
          runRef.suggestionIndex,
          true
        );
        notifyPullRequestAgentReviewChanged(run);
      }
    } catch (error) {
      console.warn("Failed to mark agent review suggestion as applied:", error);
    }
  }

  sessions.kill(sessionId);
  return true;
}

async function finalizeAgentReviewApplyFromExit(
  runRef: {
    runId: string;
    repo: string;
    number: number;
    reviewVersion: number;
    suggestionIndex: number;
  },
  exitCode: number
): Promise<void> {
  if (exitCode !== 0) {
    console.warn(
      `Agent review apply session exited with code ${exitCode} ` +
      `(run=${runRef.runId}, suggestion=${runRef.suggestionIndex})`
    );
  }
}

function isDocumentPlaceholder(rawJson: string | null): boolean {
  if (!rawJson) return true;
  try {
    const parsed = JSON.parse(rawJson);
    return isAgentReviewPlaceholderPayload(parsed);
  } catch {
    return true;
  }
}

function finalizeBackgroundTaskRunFromEvent(
  sessionId: string,
  taskRun: {
    runId: string;
    taskId: string;
    action: TaskAction;
    stagePath: string;
  },
  event: unknown
): boolean {
  if (!event || typeof event !== "object") return false;
  const ev = event as Record<string, any>;
  if (ev.type !== "result") return false;

  const isSuccess = ev.subtype === "success";
  const isFailure = ev.subtype === "error";
  if (!isSuccess && !isFailure) return false;

  taskRunsBySession.delete(sessionId);
  try {
    const output = isSuccess
      ? String(ev.result ?? "").trim() || null
      : null;
    const error = isFailure
      ? String(ev.error?.message ?? ev.result ?? "Task action failed").trim() || "Task action failed"
      : null;
    const { task } = taskRepository.finalizeRun(taskRun.runId, {
      success: isSuccess,
      output,
      error,
    });
    notifyTasksChanged(task.stagePath, task.id);
  } catch (err) {
    console.warn("Failed to finalize background task run from result event:", err);
  } finally {
    // Hidden runs are single-turn tasks; terminate the process once result is available.
    sessions.kill(sessionId);
  }
  return true;
}

function finalizeExecuteTaskRunFromEvent(
  sessionId: string,
  taskRun: {
    runId: string;
    taskId: string;
    action: TaskAction;
    stagePath: string;
  },
  event: unknown
): void {
  if (!event || typeof event !== "object") return;
  const ev = event as Record<string, any>;
  if (ev.type !== "result") return;

  const isSuccess = ev.subtype === "success";
  const isFailure = ev.subtype === "error";
  if (!isSuccess && !isFailure) return;

  taskRunsBySession.delete(sessionId);
  try {
    const output = isSuccess
      ? String(ev.result ?? "").trim() || null
      : null;
    const error = isFailure
      ? String(ev.error?.message ?? ev.result ?? "Task execution failed").trim() || "Task execution failed"
      : null;
    const { task } = taskRepository.finalizeRun(taskRun.runId, {
      success: isSuccess,
      output,
      error,
    });
    notifyTasksChanged(task.stagePath, task.id);
  } catch (err) {
    console.warn("Failed to finalize execute task run from result event:", err);
  }
}

function extractTaskRunOutput(event: unknown): string {
  if (!event || typeof event !== "object") return "";

  const ev = event as Record<string, any>;
  if (ev.type === "assistant") {
    const blocks = ev?.message?.content;
    if (!Array.isArray(blocks)) return "";
    const text = blocks
      .filter((block) => block && typeof block === "object" && block.type === "text")
      .map((block) => String(block.text ?? ""))
      .join("\n")
      .trim();
    return text ? `${text}\n` : "";
  }

  if (ev.type === "result") {
    const result = String(ev.result ?? "").trim();
    return result ? `${result}\n` : "";
  }

  if (ev.type === "error") {
    const message = String(ev.error?.message ?? "Unknown error").trim();
    return message ? `[error]\n${message}\n` : "";
  }

  return "";
}

// ── Window ───────────────────────────────────────────────────────

ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { label: "About Tango", role: "about" as any },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ],
  },
  {
    label: "File",
    submenu: [
      {
        label: "New Session",
        accelerator: "CmdOrCtrl+N",
        action: "new-session",
      },
      {
        label: "Open Stage",
        accelerator: "CmdOrCtrl+O",
        action: "open-stage",
      },
      { type: "separator" },
      { label: "Close Window", accelerator: "CmdOrCtrl+W", role: "close" as any },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Toggle Sidebar",
        accelerator: "CmdOrCtrl+1",
        action: "toggle-sidebar",
      },
      {
        label: "Toggle Second Panel",
        accelerator: "CmdOrCtrl+2",
        action: "toggle-second-panel",
      },
      {
        label: "Toggle Files Changed",
        accelerator: "CmdOrCtrl+4",
        action: "toggle-files-changed",
      },
      {
        label: "Toggle Git History",
        accelerator: "CmdOrCtrl+5",
        action: "toggle-git-history",
      },
      { type: "separator" },
      {
        label: "Developer Tools",
        accelerator: "CmdOrCtrl+Alt+I",
        action: "toggle-devtools",
      },
    ],
  },
]);

const mainWindow = new BrowserWindow({
  title: "Tango",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
  },
  titleBarStyle: "hiddenInset",
  rpc,
});

mainRPC = mainWindow.webview.rpc;

mainWindow.on("close", () => {
  watcher.stop();
  approvals.stop();
  connectors.close();
  taskRepository.close();
  Utils.quit();
});

// ── Approval server callback ─────────────────────────────────────

approvals.onApprovalRequest((req) => {
  console.log(`Tool approval requested: ${req.toolName} (${req.toolUseId})`);
  mainRPC?.send.toolApproval(req);
});

// ── Start ────────────────────────────────────────────────────────

await stages.load();
await sessionNames.load();
await prReviewStore.load();
await prAgentReviewStore.load();
await prAgentReviewStore.reconcileInterruptedRuns();
await connectors.start();
await initializeInstrumentRuntime();
await ensureServer();
try {
  approvals.start(4243);
} catch (err) {
  console.warn("Approval server failed to start; continuing without tool approvals:", err);
}
if (process.env.TANGO_DISABLE_WATCHER_AUTOSTART === "1") {
  console.warn("Watcher polling disabled (TANGO_DISABLE_WATCHER_AUTOSTART=1)");
} else {
  try {
    watcher.start();
  } catch (err) {
    console.warn("Watcher failed to start; running without live snapshots:", err);
  }
}

// Install the PreToolUse hook for tool approval
installApprovalHook().catch((err) => {
  console.warn("Failed to install approval hook:", err);
});

console.log("Tango initialized");

// ── Helpers ──────────────────────────────────────────────────────

function buildSessionList(snapshot: Snapshot): SessionInfo[] {
  const seen = new Set<string>();
  const result: SessionInfo[] = [];

  // From tasks (includes both active and finished)
  for (const task of snapshot.tasks) {
    if (seen.has(task.sessionId)) continue;
    seen.add(task.sessionId);

    // Derive activity from task status
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

    // Use custom name if set, otherwise fall back to task topic
    const customName = sessionNames.get(task.sessionId);
    const topic = customName ?? task.topic;

    result.push({
      sessionId: task.sessionId,
      topic,
      prompt: task.prompt,
      cwd: task.cwd,
      activity,
      model: task.model,
      contextPercentage: task.contextPercentage,
      currentToolLabel: task.currentToolLabel,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      isAppSpawned: sessions.isAppSpawned(task.sessionId),
      transcriptPath: task.transcriptPath,
    });
  }

  return result;
}
