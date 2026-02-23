import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { BranchCommit, BranchRef, BranchRefKind } from "../shared/types.ts";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 300;
const FIELD_SEP = "\u001f";

export async function getBranchHistory(
  cwd: string,
  limit = DEFAULT_LIMIT
): Promise<BranchCommit[]> {
  if (!(await hasGit(cwd))) return [];

  const safeLimit = normalizeLimit(limit);
  const pretty = `%H%x1f%h%x1f%an%x1f%ar%x1f%D%x1f%s`;

  try {
    const proc = Bun.spawn(
      [
        "git",
        "log",
        "--decorate=short",
        `--max-count=${safeLimit}`,
        `--pretty=format:${pretty}`,
      ],
      {
        cwd,
        stdout: "pipe",
        stderr: "ignore",
      }
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0 || !output.trim()) return [];

    const commits: BranchCommit[] = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const parsed = parseLogLine(line);
      if (parsed) commits.push(parsed);
    }
    return commits;
  } catch {
    return [];
  }
}

function parseLogLine(line: string): BranchCommit | null {
  const [hash, shortHash, author, relativeTime, decorate, ...subjectParts] = line.split(FIELD_SEP);
  if (!hash || !shortHash || !author || !relativeTime) return null;

  const subject = subjectParts.join(FIELD_SEP).trim() || "(no subject)";
  const refs = parseRefs(decorate ?? "");
  return {
    hash,
    shortHash,
    subject,
    author,
    relativeTime,
    refs,
    isHead: refs.some((ref) => ref.kind === "head"),
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

async function hasGit(cwd: string): Promise<boolean> {
  try {
    const s = await stat(join(cwd, ".git"));
    return s.isDirectory();
  } catch {
    return false;
  }
}
