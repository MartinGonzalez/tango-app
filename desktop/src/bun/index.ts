import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import { existsSync } from "node:fs";
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
  clearLastTurnDiffForWorkspace,
} from "./diff-provider.ts";
import { getBranchHistory, getCommitDiff } from "./branch-history.ts";
import {
  generateCommitMessage,
  getCommitContext,
  performCommit,
} from "./commit-provider.ts";
import { listSessionsForWorkspace } from "./session-history.ts";
import { WorkspaceStore } from "./workspace-store.ts";
import { ApprovalServer } from "./approval-server.ts";
import { installApprovalHook } from "./hook-installer.ts";
import { SessionNamesStore } from "./session-names-store.ts";
import {
  getWorkspaceFiles,
  getWorkspaceFileContent,
  invalidateWorkspaceFilesCache,
} from "./workspace-files.ts";
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
  getPullRequestDetail,
  getPullRequestDiff,
  replyPullRequestReviewComment,
} from "./pr-provider.ts";
import { TaskRepository } from "./task-repository.ts";
import { PRReviewStore } from "./pr-review-store.ts";
import { ConnectorsRepository } from "./connectors-repository.ts";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getWorkspacePathVariantsSync,
} from "./project-path.ts";
import type {
  AppRPC,
  SessionInfo,
  Snapshot,
  Activity,
  TaskAction,
  TaskCardStatus,
  ConnectorProvider,
  TaskSourceKind,
} from "../shared/types.ts";

console.log("Claudex starting...");

// ── Services ─────────────────────────────────────────────────────

const watcher = new WatcherClient();
const sessions = new SessionManager();
const workspaces = new WorkspaceStore();
const approvals = new ApprovalServer();
const sessionNames = new SessionNamesStore();
const connectors = new ConnectorsRepository();
const taskRepository = new TaskRepository(undefined, connectors);
const prReviewStore = new PRReviewStore();

let latestSnapshot: Snapshot | null = null;
let mainRPC: any = null;
const sessionCwds = new Map<string, string>();
const taskRunsBySession = new Map<string, {
  runId: string;
  taskId: string;
  action: TaskAction;
  workspacePath: string;
}>();
const IMPROVE_TASK_MODEL = process.env.CLAUDE_TASK_IMPROVE_MODEL?.trim()
  || "claude-haiku-4-5-20251001";
const PLAN_TASK_MODEL = process.env.CLAUDE_TASK_PLAN_MODEL?.trim()
  || "opus";

// ── Auto-start watcher server if needed ──────────────────────────

async function ensureServer(): Promise<void> {
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
  latestSnapshot = snapshot;
  mainRPC?.send.snapshotUpdate(snapshot);
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
  }
  const cwd = sessionCwds.get(tempId);
  if (cwd) {
    sessionCwds.delete(tempId);
    sessionCwds.set(realId, cwd);
    void remapTurnDiffSessionId(cwd, tempId, realId).catch((err) => {
      console.warn("Failed to remap per-session diff state:", err);
    });
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
  const taskRun = taskRunsBySession.get(sessionId);
  if (taskRun) {
    taskRunsBySession.delete(sessionId);
    try {
      const { task } = taskRepository.finalizeRun(taskRun.runId, {
        success: exitCode === 0,
        exitCode,
        error: exitCode === 0 ? null : `Session exited with code ${exitCode}`,
      });
      notifyTasksChanged(task.workspacePath, task.id);
    } catch (err) {
      console.warn("Failed to finalize task run:", err);
    }
  }
  mainRPC?.send.sessionEnded({ sessionId, exitCode });
});

sessions.onError((sessionId, error) => {
  console.error(`Session ${sessionId} error:`, error);
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
          await workspaces.add(cwd);
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
        return listSessionsForWorkspace(cwd);
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
        return getCommitDiff(cwd, commitHash);
      },

      getBranchHistory: async ({
        cwd,
        limit,
      }: {
        cwd: string;
        limit?: number;
      }) => {
        return getBranchHistory(cwd, limit);
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

      getWorkspaces: async () => {
        await workspaces.load();
        return workspaces.getAll();
      },

      getSessionNames: async () => {
        return sessionNames.getAll();
      },

      getWorkspaceFiles: async ({ cwd }: { cwd: string }) => {
        if (!cwd) return [];
        return getWorkspaceFiles(cwd);
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
        return getWorkspaceFileContent(cwd, path, maxBytes);
      },

      getSlashCommands: async ({ cwd }: { cwd: string }) => {
        if (!cwd) return [];
        return getSlashCommands(cwd);
      },

      getInstalledPlugins: async () => {
        return getInstalledPlugins();
      },

      getWorkspaceTasks: async ({
        workspacePath,
      }: {
        workspacePath: string;
      }) => {
        if (!workspacePath) return [];
        return taskRepository.listWorkspaceTasks(workspacePath);
      },

      getTaskDetail: async ({ taskId }: { taskId: string }) => {
        if (!taskId) return null;
        return taskRepository.getTaskDetail(taskId);
      },

      createTask: async ({
        workspacePath,
        title,
        notes,
      }: {
        workspacePath: string;
        title?: string;
        notes?: string;
      }) => {
        const task = taskRepository.createTask(workspacePath, title, notes);
        notifyTasksChanged(task.workspacePath, task.id);
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
        if (!taskId) return null;
        const task = taskRepository.updateTask(taskId, patch);
        if (task) {
          notifyTasksChanged(task.workspacePath, task.id);
        }
        return task;
      },

      deleteTask: async ({ taskId }: { taskId: string }) => {
        const workspacePath = taskRepository.getTaskDetail(taskId)?.workspacePath ?? null;
        taskRepository.deleteTask(taskId);
        if (workspacePath) {
          notifyTasksChanged(workspacePath);
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
          notifyTasksChanged(task.workspacePath, task.id);
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
        let source = taskRepository.updateTaskSource(sourceId, patch);
        if (source && patch.url !== undefined && patch.url !== null && patch.url.trim()) {
          const fetched = await taskRepository.fetchTaskSource(source.id);
          if (fetched) source = fetched;
        }

        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) {
            notifyTasksChanged(task.workspacePath, task.id);
          }
        }
        return source;
      },

      removeTaskSource: async ({ sourceId }: { sourceId: string }) => {
        const source = taskRepository.getTaskSource(sourceId);
        taskRepository.removeTaskSource(sourceId);
        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) notifyTasksChanged(task.workspacePath, task.id);
        }
      },

      fetchTaskSource: async ({ sourceId }: { sourceId: string }) => {
        const source = await taskRepository.fetchTaskSource(sourceId);
        if (source) {
          const task = taskRepository.getTaskDetail(source.taskId);
          if (task) {
            notifyTasksChanged(task.workspacePath, task.id);
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
        const prepared = taskRepository.prepareTaskRun(taskId, action);
        notifyTasksChanged(prepared.workspacePath, prepared.task.id);

        let sessionId: string | null = null;
        try {
          if (action === "execute") {
            await beginTurnDiff(prepared.workspacePath).catch(() => {});
          }

          const tempSessionId = await sessions.spawn(
            prepared.prompt,
            prepared.workspacePath,
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

          if (action === "execute") {
            await setTurnDiffSession(prepared.workspacePath, tempSessionId).catch(() => {});
          }

          taskRepository.bindRunSession(prepared.run.id, tempSessionId);
          taskRunsBySession.set(tempSessionId, {
            runId: prepared.run.id,
            taskId: prepared.task.id,
            action,
            workspacePath: prepared.workspacePath,
          });
          sessionCwds.set(tempSessionId, prepared.workspacePath);
          approvals.registerSession(tempSessionId, true);
          await workspaces.add(prepared.workspacePath);
          notifyTasksChanged(prepared.workspacePath, prepared.task.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          taskRepository.finalizeRun(prepared.run.id, {
            success: false,
            error: message,
          });
          notifyTasksChanged(prepared.workspacePath, prepared.task.id);
          throw err;
        }

        return {
          runId: prepared.run.id,
          sessionId: action === "execute" ? sessionId : null,
        };
      },

      getTaskRuns: async ({
        taskId,
        limit,
      }: {
        taskId: string;
        limit?: number;
      }) => {
        return taskRepository.getTaskRuns(taskId, limit ?? 20);
      },

      getWorkspaceConnectors: async ({
        workspacePath,
      }: {
        workspacePath: string;
      }) => {
        if (!workspacePath) return [];
        return connectors.listWorkspaceConnectors(workspacePath);
      },

      startConnectorAuth: async ({
        workspacePath,
        provider,
      }: {
        workspacePath: string;
        provider: ConnectorProvider;
      }) => {
        return connectors.startConnectorAuth(workspacePath, provider);
      },

      getConnectorAuthStatus: async ({
        authSessionId,
      }: {
        authSessionId: string;
      }) => {
        return connectors.getConnectorAuthStatus(authSessionId);
      },

      disconnectWorkspaceConnector: async ({
        workspacePath,
        provider,
      }: {
        workspacePath: string;
        provider: ConnectorProvider;
      }) => {
        await connectors.disconnectWorkspaceConnector(workspacePath, provider);
      },

      getAssignedPullRequests: async ({ limit }: { limit?: number }) => {
        return getAssignedPullRequests(limit);
      },

      getOpenedPullRequests: async ({ limit }: { limit?: number }) => {
        return getOpenedPullRequests(limit);
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

      addWorkspace: async ({ path }) => {
        await workspaces.add(path);
        invalidateWorkspaceFilesCache(path);
        invalidateSlashCommandsCache(path);
        invalidateInstalledPluginsCache();
      },

      removeWorkspace: async ({ path }) => {
        await workspaces.remove(path);
        await clearLastTurnDiffForWorkspace(path).catch((err) => {
          console.warn("Failed to clear workspace diff state:", err);
        });
        invalidateWorkspaceFilesCache(path);
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
            'set theFolder to choose folder with prompt "Select workspace directory"',
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
    },
    messages: {
      "*": (messageName: string | number | symbol, payload: unknown) => {
        console.log(`WebView message: ${String(messageName)}`, payload);
      },
    } as any,
  },
});

async function handleSessionEvent(sessionId: string, event: any): Promise<void> {
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
  const variants = getWorkspacePathVariantsSync(cwd);
  const paths = new Set<string>();
  for (const variant of variants) {
    const encoded = encodeClaudeProjectPath(variant);
    const legacy = encodeClaudeProjectPathLegacy(variant);
    paths.add(join(homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`));
    paths.add(join(homedir(), ".claude", "projects", legacy, `${sessionId}.jsonl`));
  }
  return Array.from(paths);
}

function notifyTasksChanged(workspacePath: string, taskId?: string): void {
  if (!workspacePath) return;
  mainRPC?.send.tasksChanged({
    workspacePath,
    taskId,
  });
}

function finalizeBackgroundTaskRunFromEvent(
  sessionId: string,
  taskRun: {
    runId: string;
    taskId: string;
    action: TaskAction;
    workspacePath: string;
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
    notifyTasksChanged(task.workspacePath, task.id);
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
    workspacePath: string;
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
    notifyTasksChanged(task.workspacePath, task.id);
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
      { label: "About Claudex", role: "about" as any },
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
        label: "Open Workspace",
        accelerator: "CmdOrCtrl+O",
        action: "open-workspace",
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
  title: "Claudex",
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

await workspaces.load();
await sessionNames.load();
await prReviewStore.load();
await connectors.start();
await ensureServer();
approvals.start(4243);
watcher.start();

// Install the PreToolUse hook for tool approval
installApprovalHook().catch((err) => {
  console.warn("Failed to install approval hook:", err);
});

console.log("Claudex initialized");

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
