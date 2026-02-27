import type { DiffFile, DiffHunk, DiffLine, DiffScope } from "../shared/types.ts";
import { parseDiff } from "../mainview/components/diff-parser.ts";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { getVcsStrategy } from "./vcs/vcs-provider.ts";

// ── Snapshot store ──────────────────────────────────────────────
// Per-stage snapshots used for:
// - allBaseline: non-git fallback for "all changes"
// - turnBaseline: snapshot captured right before a prompt/follow-up
// - lastTurnDiffBySession: per-session diffs computed when turns finish

type FileSnapshot = { content: string; mtime: number };
type GitStageContext = {
  repoRoot: string;
  stagePrefix: string;
};
type StageSnapshotState = {
  allBaseline: Map<string, FileSnapshot> | null;
  turnBaseline: Map<string, FileSnapshot> | null;
  turnSessionId: string | null;
  lastTurnDiffBySession: Map<string, DiffFile[]>;
  loadedPersistedLastTurn: boolean;
};
const snapshotState = new Map<string, StageSnapshotState>();
const LAST_TURN_DIFF_STORE_DIR = join(
  homedir(),
  ".tango",
  "last-turn-diffs"
);
const PERSISTED_LAST_TURN_DIFF_VERSION = 2;

type PersistedLastTurnDiff = {
  version: number;
  cwd: string;
  savedAt: string;
  sessions: Record<string, DiffFile[]>;
};
type LegacyPersistedLastTurnDiff = {
  version: number;
  cwd: string;
  sessionId: string | null;
  savedAt: string;
  files: DiffFile[];
};

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".cache",
  "__pycache__", ".DS_Store", ".venv", "venv", ".tox",
]);
const IGNORE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2",
  ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz",
  ".exe", ".dll", ".so", ".dylib", ".o", ".pyc",
]);
const MAX_FILE_SIZE = 512 * 1024; // 512KB — skip large files

/**
 * Set/refresh the stage baseline snapshot.
 * Kept for compatibility with existing call sites.
 */
export async function takeSnapshot(cwd: string): Promise<void> {
  const state = getStageState(cwd);
  state.allBaseline = await captureStageSnapshot(cwd);
}

/**
 * Ensure a non-git baseline exists for this stage.
 */
export async function ensureDiffBaseline(cwd: string): Promise<void> {
  const state = getStageState(cwd);
  if (!state.allBaseline) {
    state.allBaseline = await captureStageSnapshot(cwd);
  }
}

/**
 * Capture a baseline snapshot for the next turn's diff.
 * Call right before sending prompt/follow-up.
 */
export async function beginTurnDiff(
  cwd: string,
  sessionId?: string
): Promise<void> {
  await ensureDiffBaseline(cwd);
  const state = getStageState(cwd);
  await ensureLoadedPersistedLastTurnDiff(cwd, state);
  state.turnBaseline = await captureStageSnapshot(cwd);
  state.turnSessionId = sessionId ?? null;
  if (sessionId) {
    state.lastTurnDiffBySession.delete(sessionId);
    await savePersistedLastTurnDiff(cwd, state.lastTurnDiffBySession);
  }
}

/**
 * Associate the current in-flight turn with a concrete session ID.
 * Useful for new prompts where the temp session ID is known only after spawn().
 */
export async function setTurnDiffSession(
  cwd: string,
  sessionId: string
): Promise<void> {
  if (!sessionId) return;
  const state = getStageState(cwd);
  await ensureLoadedPersistedLastTurnDiff(cwd, state);
  state.turnSessionId = sessionId;
  state.lastTurnDiffBySession.delete(sessionId);
  await savePersistedLastTurnDiff(cwd, state.lastTurnDiffBySession);
}

/**
 * Move pending/stored per-session diff data from a temporary ID to a real one.
 */
export async function remapTurnDiffSessionId(
  cwd: string,
  fromSessionId: string,
  toSessionId: string
): Promise<void> {
  if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return;
  const state = getStageState(cwd);
  await ensureLoadedPersistedLastTurnDiff(cwd, state);

  let changed = false;
  if (state.turnSessionId === fromSessionId) {
    state.turnSessionId = toSessionId;
    changed = true;
  }

  const fromFiles = state.lastTurnDiffBySession.get(fromSessionId);
  if (fromFiles) {
    if (!state.lastTurnDiffBySession.has(toSessionId)) {
      state.lastTurnDiffBySession.set(toSessionId, fromFiles);
    }
    state.lastTurnDiffBySession.delete(fromSessionId);
    changed = true;
  }

  if (changed) {
    await savePersistedLastTurnDiff(cwd, state.lastTurnDiffBySession);
  }
}

/**
 * Finalize the current turn and store the resulting "last turn" diff.
 * Call when Claude emits a result/success event.
 */
export async function finalizeTurnDiff(
  cwd: string,
  sessionId?: string
): Promise<void> {
  const state = getStageState(cwd);
  await ensureLoadedPersistedLastTurnDiff(cwd, state);
  const resolvedSessionId = sessionId ?? state.turnSessionId;
  let files: DiffFile[] = [];

  if (!state.turnBaseline) {
    if (resolvedSessionId) {
      state.lastTurnDiffBySession.set(resolvedSessionId, files);
      await savePersistedLastTurnDiff(cwd, state.lastTurnDiffBySession);
    }
    state.turnSessionId = null;
    return;
  }

  files = await getSnapshotDiffFromBaseline(cwd, state.turnBaseline);
  state.turnBaseline = null;
  state.turnSessionId = null;

  if (!resolvedSessionId) {
    return;
  }

  state.lastTurnDiffBySession.set(resolvedSessionId, files);
  await savePersistedLastTurnDiff(cwd, state.lastTurnDiffBySession);
}

/**
 * Get diff for a stage.
 * - scope=last_turn: returns stored per-turn diff
 * - scope=all: git diff (if git), snapshot baseline diff otherwise
 */
export async function getDiff(
  cwd: string,
  scope: DiffScope = "all",
  sessionId?: string
): Promise<DiffFile[]> {
  const state = getStageState(cwd);

  if (scope === "last_turn") {
    const selectedSessionId = sessionId ?? null;
    if (!selectedSessionId) {
      return [];
    }
    if (state.turnBaseline && state.turnSessionId === selectedSessionId) {
      // Live preview while Claude is still working on the current turn.
      return getSnapshotDiffFromBaseline(cwd, state.turnBaseline);
    }
    await ensureLoadedPersistedLastTurnDiff(cwd, state);
    return state.lastTurnDiffBySession.get(selectedSessionId) ?? [];
  }

  const strategy = await getVcsStrategy(cwd);
  if (strategy.kind !== "none") {
    return strategy.getWorkingTreeDiff(cwd);
  }

  await ensureDiffBaseline(cwd);
  return getSnapshotDiffFromBaseline(cwd, state.allBaseline!);
}

/**
 * Remove all in-memory and persisted diff state for a stage.
 * Use when the stage is removed from the app.
 */
export async function clearLastTurnDiffForStage(cwd: string): Promise<void> {
  snapshotState.delete(cwd);
  await clearPersistedLastTurnDiff(cwd);
}

/**
 * Remove persisted "last turn diff" data tied to a deleted session.
 * If `cwd` is provided, only that stage is checked. Otherwise all persisted
 * stage diff files are scanned.
 */
export async function clearLastTurnDiffForSession(
  sessionId: string,
  cwd?: string
): Promise<void> {
  if (!sessionId) return;

  if (cwd) {
    await clearLastTurnDiffForSessionInStage(cwd, sessionId);
    return;
  }

  let entries;
  try {
    entries = await readdir(LAST_TURN_DIFF_STORE_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const persistedPath = join(LAST_TURN_DIFF_STORE_DIR, entry.name);
    const persisted = await readPersistedLastTurnDiff(persistedPath);
    if (!persisted || !(sessionId in persisted.sessions)) continue;

    delete persisted.sessions[sessionId];
    clearInMemoryDiffForSession(persisted.cwd, sessionId);

    if (Object.keys(persisted.sessions).length === 0) {
      await rm(persistedPath, { force: true }).catch(() => {});
      continue;
    }

    persisted.savedAt = new Date().toISOString();
    await writePersistedLastTurnDiff(persistedPath, persisted);
  }
}

async function clearLastTurnDiffForSessionInStage(
  cwd: string,
  sessionId: string
): Promise<void> {
  clearInMemoryDiffForSession(cwd, sessionId);

  const persisted = await loadPersistedLastTurnDiff(cwd);
  if (!persisted || !(sessionId in persisted.sessions)) return;

  delete persisted.sessions[sessionId];
  await savePersistedLastTurnDiff(
    cwd,
    new Map(Object.entries(persisted.sessions))
  );
}

async function ensureLoadedPersistedLastTurnDiff(
  cwd: string,
  state: StageSnapshotState
): Promise<void> {
  if (state.loadedPersistedLastTurn) return;
  state.loadedPersistedLastTurn = true;

  const persisted = await loadPersistedLastTurnDiff(cwd);
  if (!persisted) return;
  state.lastTurnDiffBySession = new Map(Object.entries(persisted.sessions));
}

function clearInMemoryDiffForSession(cwd: string, sessionId: string): void {
  const state = snapshotState.get(cwd);
  if (!state) return;
  if (state.turnSessionId === sessionId) {
    state.turnSessionId = null;
  }
  state.lastTurnDiffBySession.delete(sessionId);
}

async function savePersistedLastTurnDiff(
  cwd: string,
  filesBySession: Map<string, DiffFile[]>
): Promise<void> {
  if (filesBySession.size === 0) {
    await clearPersistedLastTurnDiff(cwd);
    return;
  }

  const payload: PersistedLastTurnDiff = {
    version: PERSISTED_LAST_TURN_DIFF_VERSION,
    cwd,
    savedAt: new Date().toISOString(),
    sessions: Object.fromEntries(filesBySession),
  };

  try {
    await mkdir(LAST_TURN_DIFF_STORE_DIR, { recursive: true });
    await writePersistedLastTurnDiff(getPersistedLastTurnDiffPath(cwd), payload);
  } catch {
    // Non-fatal: keep in-memory diff behavior even if persistence fails.
  }
}

async function clearPersistedLastTurnDiff(cwd: string): Promise<void> {
  try {
    await rm(getPersistedLastTurnDiffPath(cwd), { force: true });
  } catch {
    // Ignore missing/unreadable files.
  }
}

async function loadPersistedLastTurnDiff(
  cwd: string
): Promise<PersistedLastTurnDiff | null> {
  const persisted = await readPersistedLastTurnDiff(getPersistedLastTurnDiffPath(cwd));
  if (!persisted || persisted.cwd !== cwd) return null;
  return persisted;
}

async function readPersistedLastTurnDiff(
  path: string
): Promise<PersistedLastTurnDiff | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (isPersistedLastTurnDiff(parsed)) {
      return parsed;
    }
    if (isLegacyPersistedLastTurnDiff(parsed)) {
      const sessions = parsed.sessionId
        ? { [parsed.sessionId]: parsed.files }
        : {};
      return {
        version: PERSISTED_LAST_TURN_DIFF_VERSION,
        cwd: parsed.cwd,
        savedAt: parsed.savedAt,
        sessions,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function isPersistedLastTurnDiff(
  value: unknown
): value is PersistedLastTurnDiff {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === PERSISTED_LAST_TURN_DIFF_VERSION
    && typeof candidate.cwd === "string"
    && typeof candidate.savedAt === "string"
    && isDiffSessionsRecord(candidate.sessions);
}

function isLegacyPersistedLastTurnDiff(
  value: unknown
): value is LegacyPersistedLastTurnDiff {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && typeof candidate.cwd === "string"
    && (typeof candidate.sessionId === "string" || candidate.sessionId === null)
    && typeof candidate.savedAt === "string"
    && Array.isArray(candidate.files);
}

function isDiffSessionsRecord(value: unknown): value is Record<string, DiffFile[]> {
  if (!value || typeof value !== "object") return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!Array.isArray(entry)) return false;
  }
  return true;
}

async function writePersistedLastTurnDiff(
  path: string,
  payload: PersistedLastTurnDiff
): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(payload));
  } catch {
    // Ignore write failures at this layer.
  }
}

function getPersistedLastTurnDiffPath(cwd: string): string {
  const key = createHash("sha256").update(cwd).digest("hex");
  return join(LAST_TURN_DIFF_STORE_DIR, `${key}.json`);
}

// ── Git-based diff ──────────────────────────────────────────────

export async function getGitDiff(
  cwd: string,
  gitContext?: GitStageContext
): Promise<DiffFile[]> {
  try {
    if (!gitContext && !(await getGitStageContext(cwd))) return [];
    const [trackedOutput, untrackedPaths] = await Promise.all([
      runGitStdout(cwd, ["diff", "HEAD"]),
      listUntrackedFiles(cwd),
    ]);

    const tracked = trackedOutput.trim() ? parseDiff(trackedOutput) : [];
    if (untrackedPaths.length === 0) {
      return tracked;
    }

    const existingPaths = new Set(tracked.map((file) => file.path));
    const untracked: DiffFile[] = [];
    for (const relPath of untrackedPaths) {
      if (existingPaths.has(relPath)) continue;
      const file = await buildUntrackedAddedFile(cwd, relPath);
      if (file) untracked.push(file);
    }

    if (untracked.length === 0) {
      return tracked;
    }

    const merged = [...tracked, ...untracked];
    merged.sort((a, b) => a.path.localeCompare(b.path));
    return merged;
  } catch {
    return [];
  }
}

async function runGitStdout(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) return "";
  return stdout;
}

async function getGitStageContext(cwd: string): Promise<GitStageContext | null> {
  const repoRootRaw = (await runGitStdout(cwd, ["rev-parse", "--show-toplevel"])).trim();
  if (!repoRootRaw) return null;

  const [repoRoot, resolvedCwd] = await Promise.all([
    realpath(repoRootRaw).catch(() => repoRootRaw),
    realpath(cwd).catch(() => cwd),
  ]);

  const rawPrefix = relative(repoRoot, resolvedCwd);
  if (rawPrefix.startsWith("..")) return null;

  const stagePrefix = rawPrefix === "" || rawPrefix === "."
    ? ""
    : normalizeRelativePath(rawPrefix);

  return {
    repoRoot,
    stagePrefix,
  };
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function listUntrackedFiles(cwd: string): Promise<string[]> {
  const proc = Bun.spawn(
    ["git", "ls-files", "--others", "--exclude-standard", "-z"],
    {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    }
  );
  const bytes = await new Response(proc.stdout).arrayBuffer();
  const exitCode = await proc.exited;
  if (exitCode !== 0 || bytes.byteLength === 0) return [];

  const text = new TextDecoder().decode(bytes);
  return text
    .split("\0")
    .filter((path) => path.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

async function buildUntrackedAddedFile(
  cwd: string,
  relPath: string
): Promise<DiffFile | null> {
  const fullPath = join(cwd, relPath);

  let fileStat;
  try {
    fileStat = await stat(fullPath);
  } catch {
    return null;
  }

  if (!fileStat.isFile()) {
    return null;
  }

  if (fileStat.size > MAX_FILE_SIZE) {
    return makeBinaryAddedFile(relPath);
  }

  try {
    const bytes = await readFile(fullPath);
    if (isProbablyBinary(bytes)) {
      return makeBinaryAddedFile(relPath);
    }
    return makeAddedFile(relPath, bytes.toString("utf-8"));
  } catch {
    return null;
  }
}

function makeBinaryAddedFile(path: string): DiffFile {
  return {
    path,
    oldPath: null,
    status: "added",
    isBinary: true,
    hunks: [],
  };
}

function isProbablyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;

  const sampleLength = Math.min(bytes.length, 8192);
  let suspicious = 0;

  for (let i = 0; i < sampleLength; i++) {
    const value = bytes[i];
    if (value === 0) return true;

    const isControl = value < 7 || (value > 14 && value < 32);
    if (isControl) suspicious++;
  }

  return suspicious / sampleLength > 0.2;
}

// ── Snapshot-based diff ─────────────────────────────────────────

async function getSnapshotDiffFromBaseline(
  cwd: string,
  baseline: Map<string, FileSnapshot>
): Promise<DiffFile[]> {
  const current = await captureStageSnapshot(cwd);

  const diffs: DiffFile[] = [];

  // Files in current that differ from baseline
  for (const [path, curFile] of current) {
    const baseFile = baseline.get(path);
    if (!baseFile) {
      // New file
      diffs.push(makeAddedFile(path, curFile.content));
    } else if (baseFile.content !== curFile.content) {
      // Modified
      diffs.push(makeModifiedFile(path, baseFile.content, curFile.content));
    }
  }

  // Files in baseline that no longer exist
  for (const [path, baseFile] of baseline) {
    if (!current.has(path)) {
      diffs.push(makeDeletedFile(path, baseFile.content));
    }
  }

  // Sort by path
  diffs.sort((a, b) => a.path.localeCompare(b.path));
  return diffs;
}

function getStageState(cwd: string): StageSnapshotState {
  let state = snapshotState.get(cwd);
  if (!state) {
    state = {
      allBaseline: null,
      turnBaseline: null,
      turnSessionId: null,
      lastTurnDiffBySession: new Map<string, DiffFile[]>(),
      loadedPersistedLastTurn: false,
    };
    snapshotState.set(cwd, state);
  }
  return state;
}

async function captureStageSnapshot(
  cwd: string
): Promise<Map<string, FileSnapshot>> {
  const files = new Map<string, FileSnapshot>();
  const gitContext = await getGitStageContext(cwd);
  if (gitContext) {
    await captureGitStageSnapshot(cwd, gitContext, files);
    return files;
  }
  await walkDir(cwd, cwd, files);
  return files;
}

async function captureGitStageSnapshot(
  cwd: string,
  gitContext: GitStageContext,
  files: Map<string, FileSnapshot>
): Promise<void> {
  const trackedAndUntracked = await listGitStageFiles(gitContext);
  for (const relPath of trackedAndUntracked) {
    if (!relPath) continue;
    const fileName = relPath.split("/").pop() ?? relPath;
    const ext = fileName.includes(".")
      ? "." + fileName.split(".").pop()!.toLowerCase()
      : "";
    if (IGNORE_EXTENSIONS.has(ext)) continue;

    const fullPath = join(cwd, relPath);
    try {
      const s = await stat(fullPath);
      if (!s.isFile()) continue;
      if (s.size > MAX_FILE_SIZE) continue;

      const content = await readFile(fullPath, "utf-8");
      files.set(relPath, { content, mtime: s.mtimeMs });
    } catch {
      // Skip unreadable files
    }
  }
}

async function listGitStageFiles(gitContext: GitStageContext): Promise<string[]> {
  const proc = Bun.spawn(
    ["git", "ls-files", "-co", "--exclude-standard", "--full-name", "-z"],
    {
      cwd: gitContext.repoRoot,
      stdout: "pipe",
      stderr: "ignore",
    }
  );

  const bytes = await new Response(proc.stdout).arrayBuffer();
  const exitCode = await proc.exited;
  if (exitCode !== 0 || bytes.byteLength === 0) {
    return [];
  }

  const prefix = gitContext.stagePrefix;
  const text = new TextDecoder().decode(bytes);
  const files = text
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => normalizeRelativePath(path));

  if (!prefix) {
    files.sort((a, b) => a.localeCompare(b));
    return files;
  }

  const prefixWithSlash = `${prefix}/`;
  const scoped = files
    .filter((path) => path.startsWith(prefixWithSlash))
    .map((path) => path.slice(prefixWithSlash.length));
  scoped.sort((a, b) => a.localeCompare(b));
  return scoped;
}

// ── File walking ────────────────────────────────────────────────

async function walkDir(
  root: string,
  dir: string,
  files: Map<string, FileSnapshot>
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(root, fullPath, files);
    } else if (entry.isFile()) {
      const ext = entry.name.includes(".")
        ? "." + entry.name.split(".").pop()!.toLowerCase()
        : "";
      if (IGNORE_EXTENSIONS.has(ext)) continue;

      try {
        const s = await stat(fullPath);
        if (s.size > MAX_FILE_SIZE) continue;

        const content = await readFile(fullPath, "utf-8");
        const relPath = relative(root, fullPath);
        files.set(relPath, { content, mtime: s.mtimeMs });
      } catch {
        // Skip unreadable files
      }
    }
  }
}

// ── Diff generation helpers ─────────────────────────────────────

function makeAddedFile(path: string, content: string): DiffFile {
  const lines = content.split("\n");
  const diffLines: DiffLine[] = lines.map((line, i) => ({
    type: "add" as const,
    content: line,
    oldLineNo: null,
    newLineNo: i + 1,
  }));

  return {
    path,
    oldPath: null,
    status: "added",
    isBinary: false,
    hunks: [
      {
        header: `@@ -0,0 +1,${lines.length} @@`,
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: lines.length,
        lines: diffLines,
      },
    ],
  };
}

function makeDeletedFile(path: string, content: string): DiffFile {
  const lines = content.split("\n");
  const diffLines: DiffLine[] = lines.map((line, i) => ({
    type: "delete" as const,
    content: line,
    oldLineNo: i + 1,
    newLineNo: null,
  }));

  return {
    path,
    oldPath: null,
    status: "deleted",
    isBinary: false,
    hunks: [
      {
        header: `@@ -1,${lines.length} +0,0 @@`,
        oldStart: 1,
        oldCount: lines.length,
        newStart: 0,
        newCount: 0,
        lines: diffLines,
      },
    ],
  };
}

function makeModifiedFile(
  path: string,
  oldContent: string,
  newContent: string
): DiffFile {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const hunks = computeHunks(oldLines, newLines);

  return {
    path,
    oldPath: null,
    status: "modified",
    isBinary: false,
    hunks,
  };
}

/**
 * Simple line-level diff: finds changed regions and produces hunks with context.
 * Uses a basic LCS-inspired approach that's good enough for showing file changes.
 */
function computeHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  // Find matching lines using a simple edit script
  const edits = myersDiff(oldLines, newLines);

  if (edits.length === 0) return [];

  // Group edits into hunks with 3 lines of context
  const CONTEXT = 3;
  const hunks: DiffHunk[] = [];
  let hunkEdits: typeof edits = [];
  let lastEditIdx = -999;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (edit.type === "equal") continue;

    // Start a new hunk if too far from last edit
    if (hunkEdits.length > 0 && i - lastEditIdx > CONTEXT * 2 + 1) {
      hunks.push(buildHunk(oldLines, newLines, edits, hunkEdits, CONTEXT));
      hunkEdits = [];
    }
    hunkEdits.push({ ...edit, idx: i });
    lastEditIdx = i;
  }

  if (hunkEdits.length > 0) {
    hunks.push(buildHunk(oldLines, newLines, edits, hunkEdits, CONTEXT));
  }

  return hunks;
}

type Edit = {
  type: "equal" | "insert" | "delete";
  oldIdx: number;
  newIdx: number;
  idx?: number;
};

function buildHunk(
  _oldLines: string[],
  _newLines: string[],
  allEdits: Edit[],
  hunkEdits: Edit[],
  context: number
): DiffHunk {
  const firstIdx = hunkEdits[0].idx!;
  const lastIdx = hunkEdits[hunkEdits.length - 1].idx!;
  const startIdx = Math.max(0, firstIdx - context);
  const endIdx = Math.min(allEdits.length - 1, lastIdx + context);

  const lines: DiffLine[] = [];
  let oldLineNo = allEdits[startIdx].oldIdx + 1;
  let newLineNo = allEdits[startIdx].newIdx + 1;
  const oldStart = oldLineNo;
  const newStart = newLineNo;

  for (let i = startIdx; i <= endIdx; i++) {
    const edit = allEdits[i];
    if (edit.type === "equal") {
      lines.push({
        type: "context",
        content: _oldLines[edit.oldIdx] ?? "",
        oldLineNo: oldLineNo,
        newLineNo: newLineNo,
      });
      oldLineNo++;
      newLineNo++;
    } else if (edit.type === "delete") {
      lines.push({
        type: "delete",
        content: _oldLines[edit.oldIdx] ?? "",
        oldLineNo: oldLineNo,
        newLineNo: null,
      });
      oldLineNo++;
    } else if (edit.type === "insert") {
      lines.push({
        type: "add",
        content: _newLines[edit.newIdx] ?? "",
        oldLineNo: null,
        newLineNo: newLineNo,
      });
      newLineNo++;
    }
  }

  const oldCount = lines.filter(
    (l) => l.type === "context" || l.type === "delete"
  ).length;
  const newCount = lines.filter(
    (l) => l.type === "context" || l.type === "add"
  ).length;

  return {
    header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    oldStart,
    oldCount,
    newStart,
    newCount,
    lines,
  };
}

/**
 * Simple Myers-like diff producing an edit script of equal/insert/delete ops.
 */
function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const n = oldLines.length;
  const m = newLines.length;

  // Build LCS table using standard DP
  // For large files, limit comparison
  if (n + m > 10000) {
    // Fallback: show all old as deleted, all new as added
    return [
      ...oldLines.map(
        (_, i): Edit => ({ type: "delete", oldIdx: i, newIdx: -1 })
      ),
      ...newLines.map(
        (_, i): Edit => ({ type: "insert", oldIdx: -1, newIdx: i })
      ),
    ];
  }

  // Standard LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce edit script
  const edits: Edit[] = [];
  let i = n,
    j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: "equal", oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: "insert", oldIdx: -1, newIdx: j - 1 });
      j--;
    } else {
      edits.unshift({ type: "delete", oldIdx: i - 1, newIdx: -1 });
      i--;
    }
  }

  return edits;
}
