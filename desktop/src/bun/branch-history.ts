import { stat } from "node:fs/promises";
import { join } from "node:path";
import { parseDiff } from "../mainview/components/diff-parser.ts";
import type { BranchCommit, BranchRef, BranchRefKind, DiffFile } from "../shared/types.ts";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 300;
const FIELD_SEP = "\u001f";

export async function getBranchHistory(
  cwd: string,
  limit = DEFAULT_LIMIT
): Promise<BranchCommit[]> {
  if (!(await hasGit(cwd))) return [];

  const safeLimit = normalizeLimit(limit);
  const compareRef = await resolveCompareRef(cwd);
  const localCommitSet = compareRef
    ? await getLocalCommitSet(cwd, compareRef, safeLimit)
    : new Set<string>();

  const pretty = `%H%x1f%h%x1f%an%x1f%ar%x1f%D%x1f%s`;
  const output = await runGit(cwd, [
    "log",
    "--decorate=short",
    `--max-count=${safeLimit}`,
    `--pretty=format:${pretty}`,
  ]);
  if (!output.trim()) return [];

  try {
    const commits: BranchCommit[] = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const parsed = parseLogLine(line, localCommitSet, compareRef !== null);
      if (parsed) commits.push(parsed);
    }
    return commits;
  } catch {
    return [];
  }
}

export async function getCommitDiff(
  cwd: string,
  commitHash: string
): Promise<DiffFile[]> {
  if (!(await hasGit(cwd))) return [];

  const hash = commitHash.trim();
  if (!hash) return [];

  const output = await runGit(cwd, [
    "show",
    "--format=",
    "--patch",
    "--find-renames",
    "--find-copies",
    "--binary",
    hash,
  ]);
  if (!output.trim()) return [];

  try {
    return parseDiff(output);
  } catch {
    return [];
  }
}

function parseLogLine(
  line: string,
  localCommitSet: Set<string>,
  hasCompareRef: boolean
): BranchCommit | null {
  const [hash, shortHash, author, relativeTime, decorate, ...subjectParts] = line.split(FIELD_SEP);
  if (!hash || !shortHash || !author || !relativeTime) return null;

  const subject = subjectParts.join(FIELD_SEP).trim() || "(no subject)";
  const refs = parseRefs(decorate ?? "");
  const isLocalCommit = hasCompareRef ? localCommitSet.has(hash) : true;
  return {
    hash,
    shortHash,
    subject,
    author,
    relativeTime,
    refs,
    isHead: refs.some((ref) => ref.kind === "head"),
    isPushed: !isLocalCommit,
  };
}

function parseRefs(rawRefs: string): BranchRef[] {
  if (!rawRefs.trim()) return [];

  const refs: BranchRef[] = [];
  for (const token of rawRefs.split(",")) {
    const refLabel = token.trim();
    if (!refLabel) continue;

    if (refLabel.startsWith("HEAD -> ")) {
      const name = refLabel.slice("HEAD -> ".length).trim() || "HEAD";
      refs.push({ name, label: refLabel, kind: "head" });
      continue;
    }

    if (refLabel.startsWith("tag: ")) {
      const name = refLabel.slice("tag: ".length).trim();
      refs.push({ name: name || refLabel, label: refLabel, kind: "tag" });
      continue;
    }

    const slashIndex = refLabel.indexOf("/");
    const kind: BranchRefKind = slashIndex > 0 ? "remote" : "branch";
    refs.push({ name: refLabel, label: refLabel, kind });
  }

  return refs;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

async function resolveCompareRef(cwd: string): Promise<string | null> {
  const upstream = await runGit(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const cleanUpstream = upstream.trim();
  if (cleanUpstream) {
    return cleanUpstream;
  }

  const currentBranch = (await runGit(cwd, ["branch", "--show-current"])).trim();
  if (!currentBranch) return null;

  const originCandidate = `origin/${currentBranch}`;
  const hasOriginBranch = await hasRef(cwd, `refs/remotes/${originCandidate}`);
  if (hasOriginBranch) return originCandidate;

  return null;
}

async function getLocalCommitSet(
  cwd: string,
  compareRef: string,
  limit: number
): Promise<Set<string>> {
  const output = await runGit(cwd, [
    "rev-list",
    `--max-count=${limit}`,
    `${compareRef}..HEAD`,
  ]);

  const hashes = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return new Set(hashes);
}

async function hasRef(cwd: string, ref: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["git", "show-ref", "--verify", "--quiet", ref],
      {
        cwd,
        stdout: "ignore",
        stderr: "ignore",
      }
    );
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(
      ["git", ...args],
      {
        cwd,
        stdout: "pipe",
        stderr: "ignore",
      }
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return "";
    return output;
  } catch {
    return "";
  }
}

async function hasGit(cwd: string): Promise<boolean> {
  try {
    const s = await stat(join(cwd, ".git"));
    return s.isDirectory();
  } catch {
    return false;
  }
}
