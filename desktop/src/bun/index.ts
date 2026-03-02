import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/bun";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { WatcherClient } from "./watcher-client.ts";
import { SessionManager, resolveClaudeBinary, buildSpawnPath } from "./session-manager.ts";
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
import { compareSemver } from "../shared/version.ts";
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
import { PRReviewStore } from "./pr-review-store.ts";
import { PRAgentReviewStore } from "./pr-agent-review-store.ts";
import { PRAgentReviewProvider } from "./pr-agent-review-provider.ts";
import { isAgentReviewPlaceholderPayload } from "./pr-agent-review-files.ts";
import { ConnectorsRepository } from "./connectors-repository.ts";
import { InstrumentRuntime } from "./instruments/runtime.ts";
import { setDevReloadHandler, createDevReloadHandler } from "./instruments/dev-server.ts";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getStagePathVariantsSync,
} from "./project-path.ts";
import type {
  AppRPC,
  SessionInfo,
  Snapshot,
  Activity,
  ConnectorProvider,
  PullRequestAgentReviewRun,
} from "../shared/types.ts";

console.log("Tango starting...");

import pkg from "../../package.json";
const APP_VERSION: string = pkg.version;

const MAINVIEW_LOG_PATH = join(homedir(), ".tango", "logs", "mainview.log");

function writeMainviewLogLine(line: string): void {
  try {
    mkdirSync(dirname(MAINVIEW_LOG_PATH), { recursive: true });
    appendFileSync(MAINVIEW_LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // best-effort only
  }
}

// ── Services ─────────────────────────────────────────────────────

const watcher = new WatcherClient();
const sessions = new SessionManager();
const stages = new StageStore();
const approvals = new ApprovalServer();
const sessionNames = new SessionNamesStore();
const connectors = new ConnectorsRepository();
const prReviewStore = new PRReviewStore();
const prAgentReviewStore = new PRAgentReviewStore();
const prAgentReviewProvider = new PRAgentReviewProvider({
  getStagePaths: () => stages.getAll(),
});

const instrumentRuntime = new InstrumentRuntime({
  bundledInstallPaths: resolveBundledInstrumentInstallPaths(),
  onEvent: (event) => {
    mainRPC?.send.instrumentEvent(event);
    instrumentRuntime.emitHostEvent("instrument.event", event);
  },
  hostApi: {
    sessions: {
      start: async ({
        prompt,
        cwd,
        fullAccess,
        sessionId,
        selectedFiles,
        model,
        tools,
      }) => {
        const resolvedSessionId = await sessions.spawn(
          prompt,
          cwd,
          fullAccess ?? true,
          sessionId,
          selectedFiles ?? [],
          model,
          tools
        );
        approvals.registerSession(resolvedSessionId, fullAccess ?? true);
        sessionCwds.set(resolvedSessionId, cwd);
        await stages.add(cwd);
        instrumentRuntime.emitHostEvent("stage.added", { path: cwd });
        return { sessionId: resolvedSessionId };
      },
      sendFollowUp: async ({ sessionId, text, fullAccess, selectedFiles }) => {
        if (typeof fullAccess === "boolean") {
          approvals.setSessionFullAccess(sessionId, fullAccess);
        }
        await sessions.sendMessage(sessionId, text, selectedFiles ?? []);
      },
      kill: async (sessionId) => {
        sessions.kill(sessionId);
      },
      list: async () => {
        if (!latestSnapshot) return [];
        return buildSessionList(latestSnapshot);
      },
      query: async ({ prompt, cwd, model, tools }) => {
        const resolvedCwd = cwd || process.cwd();
        return queryClaudeSession({ prompt, cwd: resolvedCwd, model, tools });
      },
    },
    connectors: {
      listStageConnectors: async (stagePath) => connectors.listStageConnectors(stagePath),
      getCredential: async (stagePath, provider) => {
        return connectors.getConnectorCredential(stagePath, provider);
      },
      connect: async (stagePath, provider) => connectors.startConnectorAuth(stagePath, provider),
      disconnect: async (stagePath, provider) => {
        await connectors.disconnectStageConnector(stagePath, provider);
      },
    },
    stages: {
      list: async () => stages.getAll(),
      active: async () => null,
    },
  },
});

let latestSnapshot: Snapshot | null = null;
let mainRPC: any = null;
const sessionCwds = new Map<string, string>();
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

  // Scan all directories under instruments/ that contain a package.json
  // with a tango.instrument manifest. No hardcoded instrument names.
  const instrumentDirs = [
    resolve(moduleDir, "../instruments"),
    resolve(moduleDir, "../../instruments"),
    resolve(moduleDir, "../../../instruments"),
    resolve(cwd, "desktop/instruments"),
    resolve(cwd, "instruments"),
  ];

  const discovered: string[] = [];
  const seen = new Set<string>();
  for (const dir of instrumentDirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const name of entries) {
      const candidate = resolve(dir, name);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (!isInstrumentDir(candidate)) continue;
      discovered.push(candidate);
    }
  }

  const candidates = [...envPaths, ...discovered];
  const deduped: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || deduped.includes(candidate)) continue;
    if (!existsSync(join(candidate, "package.json"))) continue;
    deduped.push(candidate);
  }
  return deduped;
}

function isInstrumentDir(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return Boolean(pkg?.tango?.instrument?.id);
  } catch {
    return false;
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
  latestSnapshot = snapshot;
  mainRPC?.send.snapshotUpdate(snapshot);
  instrumentRuntime.emitHostEvent("snapshot.update", snapshot);
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
  instrumentRuntime.emitHostEvent("session.idResolved", { tempId, realId });
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
  mainRPC?.send.sessionEnded({ sessionId, exitCode });
  instrumentRuntime.emitHostEvent("session.ended", { sessionId, exitCode });
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
  mainRPC?.send.sessionStream({
    sessionId,
    event: { type: "error", error: { message: error } },
  });
  instrumentRuntime.emitHostEvent("session.stream", {
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
        model,
        tools,
      }: {
        prompt: string;
        cwd: string;
        fullAccess?: boolean;
        sessionId?: string;
        selectedFiles?: string[];
        model?: string;
        tools?: string[];
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
            selectedFiles ?? [],
            model,
            tools
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

      querySession: async ({
        prompt,
        cwd,
        model,
        tools,
      }: {
        prompt: string;
        cwd: string;
        model?: string;
        tools?: string[];
      }) => {
        return queryClaudeSession({ prompt, cwd, model, tools });
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
        return listSessionsForStage(cwd);
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
        const session = await connectors.startConnectorAuth(stagePath, provider);
        instrumentRuntime.emitHostEvent("connector.auth.changed", session);
        return session;
      },

      getConnectorAuthStatus: async ({
        authSessionId,
      }: {
        authSessionId: string;
      }) => {
        const session = await connectors.getConnectorAuthStatus(authSessionId);
        instrumentRuntime.emitHostEvent("connector.auth.changed", session);
        return session;
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

      getConnectorCredential: async ({
        stagePath,
        provider,
      }: {
        stagePath: string;
        provider: ConnectorProvider;
      }) => {
        return connectors.getConnectorCredential(stagePath, provider);
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
        instrumentRuntime.emitHostEvent("stage.added", { path });
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
        instrumentRuntime.emitHostEvent("stage.removed", { path });
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

      getInstrumentFrontendSource: async ({
        instrumentId,
      }: {
        instrumentId: string;
      }) => {
        const id = String(instrumentId ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        return instrumentRuntime.getFrontendSource(id);
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

      getInstrumentSettingsSchema: async ({
        instrumentId,
      }: {
        instrumentId: string;
      }) => {
        const id = String(instrumentId ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        return instrumentRuntime.getSettingsSchema(id);
      },

      getInstrumentSettingsValues: async ({
        instrumentId,
      }: {
        instrumentId: string;
      }) => {
        const id = String(instrumentId ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        const values = await instrumentRuntime.getSettingsValues(id);
        return { values };
      },

      setInstrumentSettingValue: async ({
        instrumentId,
        key,
        value,
      }: {
        instrumentId: string;
        key: string;
        value: unknown;
      }) => {
        const id = String(instrumentId ?? "").trim();
        const normalizedKey = String(key ?? "").trim();
        if (!id) {
          throw new Error("instrumentId is required");
        }
        if (!normalizedKey) {
          throw new Error("setting key is required");
        }
        const values = await instrumentRuntime.setSettingValue(id, normalizedKey, value);
        return { values };
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

      instrumentCallAction: async ({
        instrumentId,
        action,
        input,
      }: {
        instrumentId: string;
        action: string;
        input?: unknown;
      }) => {
        const result = await instrumentRuntime.callAction(instrumentId, action, input);
        return { result };
      },

      getAppVersion: async () => {
        return { version: APP_VERSION };
      },

      checkForUpdate: async () => {
        const currentVersion = APP_VERSION;

        const repo = "MartinGonzalez/tango-app";
        try {
          // Fetch all releases (not just /latest) so pre-releases (rc, beta, alpha) are included.
          const res = await fetch(
            `https://api.github.com/repos/${repo}/releases?per_page=20`,
            {
              headers: { Accept: "application/vnd.github.v3+json" },
            }
          );
          if (!res.ok) {
            return { available: false, latestVersion: currentVersion, downloadUrl: "" };
          }
          const releases = (await res.json()) as Array<{
            tag_name?: string;
            html_url?: string;
            draft?: boolean;
          }>;

          // Find the newest release (by semver) that's newer than current.
          let bestVersion = currentVersion;
          let bestUrl = `https://github.com/${repo}/releases/latest`;
          for (const rel of releases) {
            if (rel.draft) continue;
            const ver = (rel.tag_name ?? "").replace(/^v/, "");
            if (!ver) continue;
            if (compareSemver(ver, bestVersion) > 0) {
              bestVersion = ver;
              bestUrl = rel.html_url ?? bestUrl;
            }
          }

          const available = compareSemver(currentVersion, bestVersion) < 0;
          return { available, latestVersion: bestVersion, downloadUrl: bestUrl };
        } catch {
          return { available: false, latestVersion: currentVersion, downloadUrl: "" };
        }
      },

      toggleMaximize: async () => {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
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

  if (event?.type === "result" && event?.subtype === "success") {
    const cwd = resolveSessionCwd(sessionId);
    if (cwd) {
      await finalizeTurnDiff(cwd, sessionId).catch((err) => {
        console.warn("Failed to finalize turn diff:", err);
      });
    }
  }

  mainRPC?.send.sessionStream({ sessionId, event });
  instrumentRuntime.emitHostEvent("session.stream", { sessionId, event });
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

async function initializeInstrumentRuntime(): Promise<void> {
  try {
    await instrumentRuntime.load();
  } catch (err) {
    console.warn("Failed to load instruments runtime:", err);
  }
}

function notifyPullRequestAgentReviewChanged(run: PullRequestAgentReviewRun): void {
  mainRPC?.send.pullRequestAgentReviewChanged({
    repo: run.repo,
    number: run.number,
    runId: run.id,
    status: run.status,
  });
  instrumentRuntime.emitHostEvent("pullRequest.agentReviewChanged", {
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

// ── Query helper (fire-and-forget, invisible to UI) ─────────────

async function queryClaudeSession(params: {
  prompt: string;
  cwd: string;
  model?: string;
  tools?: string[];
}): Promise<{ text: string; durationMs: number; costUsd: number }> {
  const startTime = Date.now();
  const claudeBin = resolveClaudeBinary();
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  if (params.model && params.model.trim()) {
    args.push("--model", params.model.trim());
  }

  if (Array.isArray(params.tools)) {
    if (params.tools.length === 0) {
      args.push("--tools", "");
    } else {
      args.push("--tools", params.tools.join(","));
    }
  }

  const proc = Bun.spawn([claudeBin, ...args], {
    cwd: params.cwd,
    env: {
      ...process.env,
      PATH: buildSpawnPath(process.env.PATH, claudeBin),
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdin = proc.stdin;
  if (stdin && typeof stdin !== "number") {
    (stdin as any).write(params.prompt + "\n");
    (stdin as any).end();
  }

  const chunks: string[] = [];
  let costUsd = 0;
  let sessionId: string | null = null;

  if (proc.stdout && typeof proc.stdout !== "number") {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            // Capture session_id from any event that carries it
            if (!sessionId && event.session_id) {
              sessionId = String(event.session_id);
            }
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text" && block.text) {
                  chunks.push(block.text);
                }
              }
            }
            if (event.type === "result") {
              if (event.cost_usd != null) {
                costUsd = Number(event.cost_usd);
              }
              if (event.result && chunks.length === 0) {
                chunks.push(String(event.result));
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      // stream read error
    }
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0 && chunks.length === 0) {
    let stderrText = "";
    try {
      if (proc.stderr && typeof proc.stderr !== "number") {
        stderrText = await new Response(proc.stderr as ReadableStream).text();
      }
    } catch {}
    throw new Error(
      stderrText.trim() || `querySession failed with exit code ${exitCode}`
    );
  }

  // Clean up transcript file — query sessions are fire-and-forget
  if (sessionId) {
    const resolvedCwd = params.cwd;
    const variants = getStagePathVariantsSync(resolvedCwd);
    for (const variant of variants) {
      for (const encode of [encodeClaudeProjectPath, encodeClaudeProjectPathLegacy]) {
        const transcriptPath = join(
          homedir(), ".claude", "projects", encode(variant), `${sessionId}.jsonl`
        );
        try {
          if (await Bun.file(transcriptPath).exists()) {
            await unlink(transcriptPath);
          }
        } catch {
          // best-effort cleanup
        }
      }
    }
  }

  return {
    text: chunks.join(""),
    durationMs: Date.now() - startTime,
    costUsd,
  };
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
  Utils.quit();
});

// ── Approval server callback ─────────────────────────────────────

approvals.onApprovalRequest((req) => {
  console.log(`Tool approval requested: ${req.toolName} (${req.toolUseId})`);
  mainRPC?.send.toolApproval(req);
  instrumentRuntime.emitHostEvent("tool.approval", req);
});

// ── Start ────────────────────────────────────────────────────────

await stages.load();
await sessionNames.load();
await prReviewStore.load();
await prAgentReviewStore.load();
await prAgentReviewStore.reconcileInterruptedRuns();
await connectors.start();
await initializeInstrumentRuntime();
setDevReloadHandler(createDevReloadHandler({
  get: (id) => instrumentRuntime.get(id),
  installFromPath: (path) => instrumentRuntime.installFromPath(path),
  list: () => instrumentRuntime.list(),
  sendDevReload: (msg) => mainRPC?.send.instrumentDevReload(msg),
}));
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
