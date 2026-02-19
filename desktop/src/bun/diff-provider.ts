import type { DiffFile, DiffHunk, DiffLine, DiffScope } from "../shared/types.ts";
import { parseDiff } from "../mainview/components/diff-parser.ts";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

// ── Snapshot store ──────────────────────────────────────────────
// Per-workspace snapshots used for:
// - allBaseline: non-git fallback for "all changes"
// - turnBaseline: snapshot captured right before a prompt/follow-up
// - lastTurnDiff: computed when the turn finishes

type FileSnapshot = { content: string; mtime: number };
type WorkspaceSnapshotState = {
  allBaseline: Map<string, FileSnapshot> | null;
  turnBaseline: Map<string, FileSnapshot> | null;
  lastTurnDiff: DiffFile[];
};
const snapshotState = new Map<string, WorkspaceSnapshotState>();

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
 * Set/refresh the workspace baseline snapshot.
 * Kept for compatibility with existing call sites.
 */
export async function takeSnapshot(cwd: string): Promise<void> {
  const state = getWorkspaceState(cwd);
  state.allBaseline = await captureWorkspaceSnapshot(cwd);
}

/**
 * Ensure a non-git baseline exists for this workspace.
 */
export async function ensureDiffBaseline(cwd: string): Promise<void> {
  const state = getWorkspaceState(cwd);
  if (!state.allBaseline) {
    state.allBaseline = await captureWorkspaceSnapshot(cwd);
  }
}

/**
 * Capture a baseline snapshot for the next turn's diff.
 * Call right before sending prompt/follow-up.
 */
export async function beginTurnDiff(cwd: string): Promise<void> {
  await ensureDiffBaseline(cwd);
  const state = getWorkspaceState(cwd);
  state.turnBaseline = await captureWorkspaceSnapshot(cwd);
  state.lastTurnDiff = [];
}

/**
 * Finalize the current turn and store the resulting "last turn" diff.
 * Call when Claude emits a result/success event.
 */
export async function finalizeTurnDiff(cwd: string): Promise<void> {
  const state = getWorkspaceState(cwd);
  if (!state.turnBaseline) {
    state.lastTurnDiff = [];
    return;
  }

  state.lastTurnDiff = await getSnapshotDiffFromBaseline(cwd, state.turnBaseline);
  state.turnBaseline = null;
}

/**
 * Get diff for a workspace.
 * - scope=last_turn: returns stored per-turn diff
 * - scope=all: git diff (if git), snapshot baseline diff otherwise
 */
export async function getDiff(
  cwd: string,
  scope: DiffScope = "all"
): Promise<DiffFile[]> {
  const state = getWorkspaceState(cwd);

  if (scope === "last_turn") {
    return state.lastTurnDiff;
  }

  if (await hasGit(cwd)) {
    return getGitDiff(cwd);
  }

  await ensureDiffBaseline(cwd);
  return getSnapshotDiffFromBaseline(cwd, state.allBaseline!);
}

// ── Git-based diff ──────────────────────────────────────────────

async function hasGit(cwd: string): Promise<boolean> {
  try {
    const s = await stat(join(cwd, ".git"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function getGitDiff(cwd: string): Promise<DiffFile[]> {
  try {
    // Show both staged and unstaged changes
    const proc = Bun.spawn(["git", "diff", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !output.trim()) return [];
    return parseDiff(output);
  } catch {
    return [];
  }
}

// ── Snapshot-based diff ─────────────────────────────────────────

async function getSnapshotDiffFromBaseline(
  cwd: string,
  baseline: Map<string, FileSnapshot>
): Promise<DiffFile[]> {
  const current = new Map<string, FileSnapshot>();
  await walkDir(cwd, cwd, current);

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

function getWorkspaceState(cwd: string): WorkspaceSnapshotState {
  let state = snapshotState.get(cwd);
  if (!state) {
    state = {
      allBaseline: null,
      turnBaseline: null,
      lastTurnDiff: [],
    };
    snapshotState.set(cwd, state);
  }
  return state;
}

async function captureWorkspaceSnapshot(
  cwd: string
): Promise<Map<string, FileSnapshot>> {
  const files = new Map<string, FileSnapshot>();
  await walkDir(cwd, cwd, files);
  return files;
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
