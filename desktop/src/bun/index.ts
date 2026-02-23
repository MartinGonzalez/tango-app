import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { WatcherClient } from "./watcher-client.ts";
import { SessionManager } from "./session-manager.ts";
import { readTranscript } from "./transcript-reader.ts";
import {
  getDiff,
  beginTurnDiff,
  finalizeTurnDiff,
} from "./diff-provider.ts";
import { getBranchHistory } from "./branch-history.ts";
import { listSessionsForWorkspace } from "./session-history.ts";
import { WorkspaceStore } from "./workspace-store.ts";
import { ApprovalServer } from "./approval-server.ts";
import { installApprovalHook } from "./hook-installer.ts";
import { SessionNamesStore } from "./session-names-store.ts";
import {
  getWorkspaceFiles,
  invalidateWorkspaceFilesCache,
} from "./workspace-files.ts";
import {
  getSlashCommands,
  invalidateSlashCommandsCache,
} from "./slash-commands.ts";
import type { AppRPC, SessionInfo, Snapshot, Activity } from "../shared/types.ts";

console.log("Claudex starting...");

// ── Services ─────────────────────────────────────────────────────

const watcher = new WatcherClient();
const sessions = new SessionManager();
const workspaces = new WorkspaceStore();
const approvals = new ApprovalServer();
const sessionNames = new SessionNamesStore();

let latestSnapshot: Snapshot | null = null;
let mainRPC: any = null;
const sessionCwds = new Map<string, string>();

// ── Auto-start watcher server if needed ──────────────────────────

async function ensureServer(): Promise<void> {
  const up = await watcher.isServerUp();
  if (up) {
    console.log("Watcher server already running");
    return;
  }

  console.log("Starting watcher server...");
  // Try common locations: env var, npm global, relative to project
  const serverPath = process.env.CLAUDE_WATCHER_SERVER
    ?? `${process.env.HOME}/Desktop/claude-watcher/src/server.js`;
  try {
    Bun.spawn(["node", serverPath], {
      env: { ...process.env, PORT: "4242" },
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch (err) {
    console.warn("Failed to spawn watcher server:", err);
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
  const cwd = sessionCwds.get(tempId);
  if (cwd) {
    sessionCwds.delete(tempId);
    sessionCwds.set(realId, cwd);
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
  mainRPC?.send.sessionEnded({ sessionId, exitCode });
});

sessions.onError((sessionId, error) => {
  console.error(`Session ${sessionId} error:`, error);
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
          await beginTurnDiff(cwd).catch(() => {});
          const sessionId = await sessions.spawn(
            prompt,
            cwd,
            fullAccess ?? true,
            resumeId,
            selectedFiles ?? []
          );
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
          await beginTurnDiff(cwd).catch(() => {});
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
        const resolvedPath = transcriptPath
          ?? latestSnapshot?.tasks.find((t) => t.sessionId === sessionId)?.transcriptPath
          ?? (cwd ? guessTranscriptPath(cwd, sessionId) : null);

        let deleted = false;
        if (resolvedPath) {
          try {
            await unlink(resolvedPath);
            deleted = true;
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              console.warn("Failed to delete transcript:", resolvedPath, err);
            }
          }
        }

        await sessionNames.delete(sessionId).catch(() => {});
        return { deleted, transcriptPath: resolvedPath ?? null };
      },

      getSessionHistory: async ({ cwd }) => {
        return listSessionsForWorkspace(cwd);
      },

      getDiff: async ({ cwd, scope }) => {
        return getDiff(cwd, scope ?? "all");
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

      getSlashCommands: async ({ cwd }: { cwd: string }) => {
        if (!cwd) return [];
        return getSlashCommands(cwd);
      },

      addWorkspace: async ({ path }) => {
        await workspaces.add(path);
        invalidateWorkspaceFilesCache(path);
        invalidateSlashCommandsCache(path);
      },

      removeWorkspace: async ({ path }) => {
        await workspaces.remove(path);
        invalidateWorkspaceFilesCache(path);
        invalidateSlashCommandsCache(path);
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
  if (event?.type === "result" && event?.subtype === "success") {
    const cwd = resolveSessionCwd(sessionId);
    if (cwd) {
      await finalizeTurnDiff(cwd).catch((err) => {
        console.warn("Failed to finalize turn diff:", err);
      });
    }
  }

  mainRPC?.send.sessionStream({ sessionId, event });
}

function resolveSessionCwd(sessionId: string): string | null {
  const direct = sessionCwds.get(sessionId);
  if (direct) return direct;

  const fromSnapshot = latestSnapshot?.tasks.find((t) => t.sessionId === sessionId)?.cwd ?? null;
  return fromSnapshot;
}

function guessTranscriptPath(cwd: string, sessionId: string): string {
  const encoded = cwd.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
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
        accelerator: "CmdOrCtrl+B",
        action: "toggle-sidebar",
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
