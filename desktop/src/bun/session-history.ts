import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

export type HistorySession = {
  sessionId: string;
  cwd: string | null;
  prompt: string | null;
  topic: string | null;
  model: string | null;
  startedAt: string | null;
  lastActiveAt: string | null;
  transcriptPath: string;
};

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

/**
 * Encode a workspace path to Claude's project directory name format.
 * e.g. /Users/foo/Desktop/project → -Users-foo-Desktop-project
 */
function encodeProjectPath(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

/**
 * List all sessions for a given workspace by scanning Claude's transcript files.
 */
export async function listSessionsForWorkspace(
  cwd: string
): Promise<HistorySession[]> {
  const projectDir = join(CLAUDE_PROJECTS_DIR, encodeProjectPath(cwd));

  let entries;
  try {
    entries = await readdir(projectDir);
  } catch {
    return [];
  }

  const jsonlFiles = entries.filter(
    (f) => f.endsWith(".jsonl") && !f.includes(".")
      ? false
      : f.endsWith(".jsonl")
  );

  const sessions: HistorySession[] = [];

  // Process files in parallel, capped at 20 most recent by filename
  // (UUIDs don't sort by time, so we parse all and sort later)
  const promises = jsonlFiles.slice(0, 200).map(async (file) => {
    const sessionId = basename(file, ".jsonl");
    const filePath = join(projectDir, file);
    try {
      return await parseTranscriptMeta(sessionId, filePath);
    } catch {
      return null;
    }
  });

  const results = await Promise.all(promises);

  for (const r of results) {
    if (r && r.prompt) {
      sessions.push(r);
    }
  }

  // Sort by most recent first
  sessions.sort((a, b) => {
    const ta = a.lastActiveAt ?? a.startedAt ?? "";
    const tb = b.lastActiveAt ?? b.startedAt ?? "";
    return tb.localeCompare(ta);
  });

  return sessions;
}

/**
 * List sessions across ALL known project directories.
 * Returns sessions grouped by cwd.
 */
export async function listAllSessions(): Promise<HistorySession[]> {
  let projectDirs;
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR);
  } catch {
    return [];
  }

  const all: HistorySession[] = [];

  for (const dir of projectDirs) {
    if (dir === "memory" || dir.startsWith(".")) continue;
    const dirPath = join(CLAUDE_PROJECTS_DIR, dir);

    let entries;
    try {
      entries = await readdir(dirPath);
    } catch {
      continue;
    }

    const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles.slice(0, 50)) {
      const sessionId = basename(file, ".jsonl");
      const filePath = join(dirPath, file);
      try {
        const session = await parseTranscriptMeta(sessionId, filePath);
        if (session?.prompt) {
          all.push(session);
        }
      } catch {
        // Skip bad files
      }
    }
  }

  all.sort((a, b) => {
    const ta = a.lastActiveAt ?? a.startedAt ?? "";
    const tb = b.lastActiveAt ?? b.startedAt ?? "";
    return tb.localeCompare(ta);
  });

  return all;
}

/**
 * Parse minimal metadata from a transcript file.
 * Only reads the first few lines to be fast.
 */
async function parseTranscriptMeta(
  sessionId: string,
  filePath: string
): Promise<HistorySession | null> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");

  let prompt: string | null = null;
  let cwd: string | null = null;
  let model: string | null = null;
  let startedAt: string | null = null;
  let lastActiveAt: string | null = null;

  // Only scan first 50 lines for speed — we just need the first user message
  const limit = Math.min(lines.length, 50);

  for (let i = 0; i < limit; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const entry = JSON.parse(line);

      // Track timestamps for any entry
      if (entry.timestamp && !startedAt) {
        startedAt = entry.timestamp;
      }
      if (entry.timestamp) {
        lastActiveAt = entry.timestamp;
      }

      // Get cwd from any entry that has it
      if (entry.cwd && !cwd) {
        cwd = entry.cwd;
      }

      // Find first user message for prompt/topic
      if (entry.type === "user" && !prompt) {
        const msg = entry.message;
        if (!msg) continue;

        if (typeof msg.content === "string") {
          prompt = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "text" && block.text) {
              prompt = block.text;
              break;
            }
          }
        }

        // Also grab model if available
        if (entry.model) model = entry.model;
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Also scan last few lines for the most recent timestamp
  if (lines.length > 50) {
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          lastActiveAt = entry.timestamp;
          break;
        }
      } catch {}
    }
  }

  if (!prompt) return null;

  // Derive topic from prompt (first line, truncated)
  const firstLine = prompt.split("\n")[0].trim();
  const topic = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;

  return {
    sessionId,
    cwd,
    prompt,
    topic,
    model,
    startedAt,
    lastActiveAt,
    transcriptPath: filePath,
  };
}
