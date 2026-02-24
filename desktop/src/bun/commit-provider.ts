import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  CommitActionMode,
  CommitContext,
  CommitExecutionResult,
} from "../shared/types.ts";

const DEFAULT_COMMIT_MODEL = process.env.CLAUDE_COMMIT_MESSAGE_MODEL?.trim() || "haiku";
const MAX_DIFF_CHARS = 24_000;
const MAX_UNTRACKED_FILES_FOR_PROMPT = 10;
const MAX_UNTRACKED_PATCH_CHARS = 16_000;
const UNTRACKED_STATS_LIMIT = 50;

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type WorkingTreeStatus = {
  staged: Set<string>;
  unstaged: Set<string>;
  untracked: Set<string>;
};

type DiffStats = {
  additions: number;
  deletions: number;
};

export async function getCommitContext(cwd: string): Promise<CommitContext> {
  if (!(await isGitRepo(cwd))) {
    return emptyCommitContext();
  }

  const status = await readWorkingTreeStatus(cwd);
  const stagedStats = await getStagedStats(cwd);
  const unstagedStats = await getUnstagedStats(cwd);
  const untrackedStats = await getUntrackedStats(
    cwd,
    Array.from(status.untracked).slice(0, UNTRACKED_STATS_LIMIT)
  );

  const totalFiles = new Set<string>([
    ...status.staged,
    ...status.unstaged,
    ...status.untracked,
  ]).size;

  const branch = await resolveBranchName(cwd);
  return {
    branch,
    hasChanges: totalFiles > 0,
    stagedFiles: status.staged.size,
    stagedAdditions: stagedStats.additions,
    stagedDeletions: stagedStats.deletions,
    unstagedFiles: status.unstaged.size,
    unstagedAdditions: unstagedStats.additions,
    unstagedDeletions: unstagedStats.deletions,
    untrackedFiles: status.untracked.size,
    totalFiles,
    totalAdditions: stagedStats.additions + unstagedStats.additions + untrackedStats.additions,
    totalDeletions: stagedStats.deletions + unstagedStats.deletions + untrackedStats.deletions,
  };
}

export async function generateCommitMessage(
  cwd: string,
  includeUnstaged = true
): Promise<string> {
  if (!(await isGitRepo(cwd))) {
    throw new Error("Not a git repository");
  }

  const context = await getCommitContext(cwd);
  if (!context.hasChanges) {
    throw new Error("No changes to commit");
  }
  if (!includeUnstaged && context.stagedFiles === 0) {
    throw new Error("No staged changes to generate a commit message");
  }

  const prompt = await buildCommitPrompt(cwd, context, includeUnstaged);
  const raw = await runClaudePrompt(cwd, prompt);
  const message = sanitizeCommitMessage(raw);
  if (!message) {
    throw new Error("Claude returned an empty commit message");
  }
  return message;
}

export async function performCommit(
  cwd: string,
  message: string,
  includeUnstaged = true,
  mode: CommitActionMode = "commit"
): Promise<CommitExecutionResult> {
  if (!(await isGitRepo(cwd))) {
    throw new Error("Not a git repository");
  }

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Commit message cannot be empty");
  }

  if (includeUnstaged) {
    const addResult = await runGit(cwd, ["add", "-A"]);
    if (addResult.exitCode !== 0) {
      throw new Error(addResult.stderr.trim() || "Failed to stage changes");
    }
  }

  const hasStaged = await hasStagedChanges(cwd);
  if (!hasStaged) {
    throw new Error("No staged changes to commit");
  }

  const branch = await resolveBranchName(cwd);
  const commitResult = await runGit(cwd, ["commit", "-m", trimmedMessage]);
  if (commitResult.exitCode !== 0) {
    throw new Error(commitResult.stderr.trim() || commitResult.stdout.trim() || "Commit failed");
  }

  const hashResult = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  const commitHash = hashResult.stdout.trim();

  let pushed = false;
  if (mode === "commit_and_push") {
    const pushResult = await runGit(cwd, ["push"]);
    if (pushResult.exitCode !== 0) {
      const pushWithUpstream = await runGit(cwd, ["push", "--set-upstream", "origin", branch]);
      if (pushWithUpstream.exitCode !== 0) {
        const details = (
          pushWithUpstream.stderr.trim()
          || pushWithUpstream.stdout.trim()
          || pushResult.stderr.trim()
          || pushResult.stdout.trim()
          || "Push failed"
        );
        throw new Error(`Commit ${commitHash || "created"} but push failed: ${details}`);
      }
    }
    pushed = true;
  }

  return {
    commitHash: commitHash || "",
    branch,
    pushed,
  };
}

async function buildCommitPrompt(
  cwd: string,
  context: CommitContext,
  includeUnstaged: boolean
): Promise<string> {
  const status = await readWorkingTreeStatus(cwd);
  const statusLines = await runGit(cwd, ["status", "--short"]);
  const stagedPatchResult = await runGit(cwd, [
    "diff",
    "--cached",
    "--patch",
    "--find-renames",
    "--",
  ]);
  const unstagedPatchResult = includeUnstaged
    ? await runGit(cwd, ["diff", "--patch", "--find-renames", "--"])
    : { stdout: "", stderr: "", exitCode: 0 };
  const untrackedFiles = includeUnstaged
    ? Array.from(status.untracked).slice(0, MAX_UNTRACKED_FILES_FOR_PROMPT)
    : [];
  const untrackedPatch = includeUnstaged
    ? await collectUntrackedPatch(cwd, untrackedFiles)
    : "";
  const omittedUntracked = includeUnstaged
    ? Math.max(0, status.untracked.size - untrackedFiles.length)
    : 0;

  const scopeFileCount = includeUnstaged
    ? context.totalFiles
    : context.stagedFiles;
  const scopeAdditions = includeUnstaged
    ? context.totalAdditions
    : context.stagedAdditions;
  const scopeDeletions = includeUnstaged
    ? context.totalDeletions
    : context.stagedDeletions;

  const sections = [
    "You are writing a git commit message for an engineering repository.",
    "Return ONLY the commit message text. No markdown, no quotes, no commentary.",
    "Use imperative voice and keep the first line under 72 chars.",
    "Prefer conventional commit prefixes when obvious (feat, fix, chore, refactor, docs, test, ci, build).",
    "If needed, include a blank line and up to 3 concise bullet points.",
    "",
    `Branch: ${context.branch}`,
    `Included scope: ${includeUnstaged ? "staged + unstaged + untracked" : "staged only"}`,
    `Summary: ${scopeFileCount} file(s), +${scopeAdditions} -${scopeDeletions}`,
    "",
    "Git status (short):",
    truncate(statusLines.stdout.trim() || "(clean)", 4_000),
    "",
    "Staged patch:",
    truncate(stagedPatchResult.stdout.trim() || "(none)", MAX_DIFF_CHARS),
  ];

  if (includeUnstaged) {
    sections.push("");
    sections.push("Unstaged patch:");
    sections.push(truncate(unstagedPatchResult.stdout.trim() || "(none)", MAX_DIFF_CHARS));

    if (untrackedPatch) {
      sections.push("");
      sections.push("Untracked file patches:");
      sections.push(truncate(untrackedPatch, MAX_UNTRACKED_PATCH_CHARS));
    } else if (status.untracked.size > 0) {
      sections.push("");
      sections.push("Untracked files:");
      sections.push(Array.from(status.untracked).join("\n"));
    }

    if (omittedUntracked > 0) {
      sections.push("");
      sections.push(`Note: ${omittedUntracked} additional untracked file(s) omitted.`);
    }
  }

  return sections.join("\n");
}

async function collectUntrackedPatch(
  cwd: string,
  untrackedFiles: string[]
): Promise<string> {
  if (untrackedFiles.length === 0) return "";

  const chunks: string[] = [];
  let charBudget = MAX_UNTRACKED_PATCH_CHARS;

  for (const file of untrackedFiles) {
    if (charBudget <= 0) break;
    const diffResult = await runGit(cwd, [
      "diff",
      "--no-index",
      "--",
      "/dev/null",
      file,
    ]);

    const patch = diffResult.stdout.trim();
    if (!patch) continue;
    const clipped = truncate(patch, charBudget);
    chunks.push(clipped);
    charBudget -= clipped.length;
  }

  return chunks.join("\n\n");
}

async function getStagedStats(cwd: string): Promise<DiffStats> {
  const result = await runGit(cwd, ["diff", "--cached", "--numstat"]);
  return parseNumstat(result.stdout);
}

async function getUnstagedStats(cwd: string): Promise<DiffStats> {
  const result = await runGit(cwd, ["diff", "--numstat"]);
  return parseNumstat(result.stdout);
}

async function getUntrackedStats(cwd: string, files: string[]): Promise<DiffStats> {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    const result = await runGit(cwd, [
      "diff",
      "--numstat",
      "--no-index",
      "--",
      "/dev/null",
      file,
    ]);
    const stats = parseNumstat(result.stdout);
    additions += stats.additions;
    deletions += stats.deletions;
  }
  return { additions, deletions };
}

function parseNumstat(output: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [rawAdd, rawDel] = line.split("\t");
    additions += parseNumstatValue(rawAdd);
    deletions += parseNumstatValue(rawDel);
  }
  return { additions, deletions };
}

function parseNumstatValue(value: string | undefined): number {
  if (!value || value === "-") return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readWorkingTreeStatus(cwd: string): Promise<WorkingTreeStatus> {
  const staged = new Set<string>();
  const unstaged = new Set<string>();
  const untracked = new Set<string>();
  const result = await runGit(cwd, ["status", "--porcelain=v1"]);

  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const parsedPath = normalizeStatusPath(line.slice(3));
    if (!parsedPath) continue;

    if (x === "?" && y === "?") {
      untracked.add(parsedPath);
      continue;
    }

    if (x !== " " && x !== "?") {
      staged.add(parsedPath);
    }
    if (y !== " ") {
      unstaged.add(parsedPath);
    }
  }

  return { staged, unstaged, untracked };
}

function normalizeStatusPath(rawPath: string): string {
  let value = rawPath.trim();
  if (!value) return "";

  const renameArrow = value.lastIndexOf(" -> ");
  if (renameArrow >= 0) {
    value = value.slice(renameArrow + 4).trim();
  }

  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      value = JSON.parse(value);
    } catch {
      // Keep raw value if JSON unescape fails.
    }
  }

  return value.trim();
}

async function hasStagedChanges(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["diff", "--cached", "--quiet"]);
  return result.exitCode === 1;
}

async function resolveBranchName(cwd: string): Promise<string> {
  const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const value = branch.stdout.trim();
  if (!value) return "(unknown)";
  if (value !== "HEAD") return value;
  const hash = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  return hash.stdout.trim() ? `detached@${hash.stdout.trim()}` : "detached";
}

async function runClaudePrompt(cwd: string, prompt: string): Promise<string> {
  const claudeBin = resolveClaudeBinary();
  const args = [
    claudeBin,
    "-p",
    "--model",
    DEFAULT_COMMIT_MODEL,
    "--output-format",
    "text",
    "--dangerously-skip-permissions",
  ];

  const proc = Bun.spawn(args, {
    cwd,
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
    (stdin as any).write(prompt);
    (stdin as any).write("\n");
    (stdin as any).flush?.();
    (stdin as any).end?.();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    readProcStream(proc.stdout),
    readProcStream(proc.stderr),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const message = stderr.trim() || stdout.trim() || `Claude exited with code ${exitCode}`;
    throw new Error(`Failed to generate commit message: ${message}`);
  }

  return stdout.trim();
}

async function runGit(cwd: string, args: string[]): Promise<CommandResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readProcStream(proc.stdout),
    readProcStream(proc.stderr),
    proc.exited,
  ]);

  return {
    stdout,
    stderr,
    exitCode,
  };
}

async function readProcStream(
  stream: ReadableStream<Uint8Array> | number | null | undefined
): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  return new Response(stream).text();
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

function sanitizeCommitMessage(value: string): string {
  let text = value.trim();
  if (!text) return "";

  if (text.startsWith("```")) {
    text = text
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/```$/, "")
      .trim();
  }

  text = text.replace(/^commit message:\s*/i, "").trim();
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[...truncated...]`;
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

const FALLBACK_CLAUDE_PATHS = [
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  join(homedir(), ".local", "bin", "claude"),
  join(homedir(), "bin", "claude"),
];

function resolveClaudeBinary(): string {
  const envBin = process.env.CLAUDE_BIN?.trim();
  if (envBin) {
    return envBin;
  }

  const fromPath = Bun.which?.("claude");
  if (fromPath) {
    return fromPath;
  }

  const fallback = FALLBACK_CLAUDE_PATHS.find((candidate) => existsSync(candidate));
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `Claude CLI binary not found. Set CLAUDE_BIN or install 'claude' in PATH. Checked: ${FALLBACK_CLAUDE_PATHS.join(", ")}`
  );
}

function buildSpawnPath(currentPath: string | undefined, claudeBin: string): string {
  const entries = String(currentPath ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set(entries);

  const extras = [
    dirname(claudeBin),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local", "bin"),
    join(homedir(), "bin"),
  ];

  for (const extra of extras) {
    if (!extra || seen.has(extra)) continue;
    entries.push(extra);
    seen.add(extra);
  }

  return entries.join(":");
}
