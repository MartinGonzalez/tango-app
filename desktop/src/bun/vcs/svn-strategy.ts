import { parseDiff } from "../../mainview/components/diff-parser.ts";
import type { BranchCommit, DiffFile } from "../../shared/types.ts";
import type { VcsStrategy } from "./types.ts";

export type SvnLogEntry = {
  revision: string;
  author: string;
  date: string;
  message: string;
};

export class SvnStrategy implements VcsStrategy {
  readonly kind = "svn" as const;

  async getBranch(cwd: string): Promise<string | null> {
    const output = await runSvn(cwd, ["info", "--show-item", "relative-url"]);
    return parseSvnBranch(output);
  }

  async getBranchHistory(cwd: string, limit = 80): Promise<BranchCommit[]> {
    const safeLimit = Math.max(1, Math.min(300, Math.floor(limit)));
    const output = await runSvn(cwd, ["log", "-l", String(safeLimit), "--xml"]);
    if (!output.trim()) return [];

    const entries = parseSvnLogXml(output);
    return entries.map((entry) => svnLogEntryToCommit(entry));
  }

  async getCommitDiff(cwd: string, commitHash: string): Promise<DiffFile[]> {
    const revision = commitHash.trim();
    if (!revision) return [];

    const output = await runSvn(cwd, ["diff", "-c", revision]);
    if (!output.trim()) return [];

    try {
      return parseDiff(output);
    } catch {
      return [];
    }
  }

  async getWorkingTreeDiff(cwd: string): Promise<DiffFile[]> {
    const output = await runSvn(cwd, ["diff"]);
    if (!output.trim()) return [];

    try {
      return parseDiff(output);
    } catch {
      return [];
    }
  }
}

/**
 * Parse SVN relative URL into a short branch name.
 * Handles standard layout with optional project prefix:
 *   ^/trunk, ^/Project/trunk → "trunk"
 *   ^/branches/X, ^/Project/branches/X → "X"
 *   ^/tags/X, ^/Project/tags/X → "X"
 * For non-standard layouts, returns the last path segment.
 */
export function parseSvnBranch(relativeUrl: string): string | null {
  const trimmed = relativeUrl.trim();
  if (!trimmed) return null;

  // Strip ^/ prefix and trailing slash
  let path = trimmed;
  if (path.startsWith("^/")) {
    path = path.slice(2);
  }
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (!path) return null;

  const segments = path.split("/");

  // Find "trunk", "branches", or "tags" anywhere in the path
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "trunk") return "trunk";

    if (segments[i] === "branches" && i + 1 < segments.length) {
      // Everything after "branches/" is the branch name (e.g. release/2.0)
      return segments.slice(i + 1).join("/");
    }

    if (segments[i] === "tags" && i + 1 < segments.length) {
      return segments.slice(i + 1).join("/");
    }
  }

  // Non-standard layout: return last segment
  return segments[segments.length - 1];
}

/**
 * Parse `svn log --xml` output into structured entries.
 * Uses simple regex-based parsing to avoid XML parser dependencies.
 */
export function parseSvnLogXml(xml: string): SvnLogEntry[] {
  if (!xml.trim()) return [];

  const entries: SvnLogEntry[] = [];
  const entryRegex = /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const revision = match[1];
    const body = match[2];

    const author = extractTag(body, "author");
    const date = extractTag(body, "date");
    const message = extractTag(body, "msg");

    entries.push({
      revision,
      author: decodeXmlEntities(author),
      date: decodeXmlEntities(date),
      message: decodeXmlEntities(message),
    });
  }

  return entries;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>((?:[\\s\\S]*?))</${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1] : "";
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function svnLogEntryToCommit(entry: SvnLogEntry): BranchCommit {
  const relativeTime = formatRelativeTime(entry.date);
  return {
    hash: entry.revision,
    shortHash: `r${entry.revision}`,
    subject: entry.message.split("\n")[0] || "(no subject)",
    author: entry.author || "(unknown)",
    relativeTime,
    refs: [],
    isHead: false,
    isPushed: true, // SVN commits are always "pushed"
  };
}

function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const date = new Date(isoDate);
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return "just now";

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

async function runSvn(cwd: string, args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(["svn", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return "";
    return output;
  } catch {
    return "";
  }
}
