import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getStagePathVariants,
} from "./project-path.ts";

export type HistorySession = {
  sessionId: string;
  cwd: string | null;
  prompt: string | null;
  topic: string | null;
  model: string | null;
  startedAt: string | null;
  lastActiveAt: string | null;
  transcriptPath: string;
  fileMtimeMs?: number;
};

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const MAX_STAGE_HISTORY_FILES = 200;

/**
 * List all sessions for a given stage by scanning Claude's transcript files.
 */
export async function listSessionsForStage(
  cwd: string
): Promise<HistorySession[]> {
  const projectDirs = await resolveStageProjectDirs(cwd);
  const candidates = await collectTranscriptCandidates(projectDirs);
  if (candidates.length === 0) {
    return [];
  }

  const sessions: HistorySession[] = [];

  // Parse the newest transcript files first to avoid dropping recent sessions.
  const promises = candidates.slice(0, MAX_STAGE_HISTORY_FILES).map(async (entry) => {
    try {
      return await parseTranscriptMeta(entry.sessionId, entry.filePath, entry.mtimeMs);
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
        let mtimeMs = 0;
        try { mtimeMs = (await stat(filePath)).mtimeMs; } catch {}
        const session = await parseTranscriptMeta(sessionId, filePath, mtimeMs);
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
  filePath: string,
  mtimeMs?: number
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

  // Derive topic from prompt (skip metadata wrappers, then truncate)
  const firstLine = extractTopicLine(prompt);
  const topic = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;

  // File mtime is the most reliable indicator of when the session was last active,
  // since transcript entries may not always have timestamps in the last few lines.
  const mtimeIso = mtimeMs ? new Date(mtimeMs).toISOString() : null;

  return {
    sessionId,
    cwd,
    prompt,
    topic,
    model,
    startedAt,
    lastActiveAt: mtimeIso ?? lastActiveAt,
    transcriptPath: filePath,
    fileMtimeMs: mtimeMs,
  };
}

function extractTopicLine(prompt: string): string {
  const commandName = extractCommandName(prompt);
  if (commandName) return commandName;

  const cleaned = prompt
    .replace(/<attached_files>\s*[\s\S]*?<\/attached_files>/gi, "\n")
    .replace(/<command-message>\s*[\s\S]*?<\/command-message>/gi, "\n")
    .replace(/<command-name>\s*[\s\S]*?<\/command-name>/gi, "\n");

  for (const rawLine of cleaned.split("\n")) {
    const line = collapseWhitespace(rawLine);
    if (line) return line;
  }

  return "Claude session";
}

function extractCommandName(prompt: string): string | null {
  const commandNameMatch = prompt.match(
    /<command-name>\s*([^<\n]+?)\s*<\/command-name>/i
  );
  if (commandNameMatch?.[1]) {
    return normalizeCommandName(commandNameMatch[1]);
  }

  const commandMessageMatch = prompt.match(
    /<command-message>\s*([\s\S]*?)\s*<\/command-message>/i
  );
  if (commandMessageMatch?.[1]) {
    return normalizeCommandName(commandMessageMatch[1]);
  }

  return null;
}

type TranscriptCandidate = {
  sessionId: string;
  filePath: string;
  mtimeMs: number;
};

async function resolveStageProjectDirs(cwd: string): Promise<string[]> {
  const variants = await getStagePathVariants(cwd);
  const dirs = new Set<string>();

  for (const variant of variants) {
    dirs.add(join(CLAUDE_PROJECTS_DIR, encodeClaudeProjectPath(variant)));
    dirs.add(join(CLAUDE_PROJECTS_DIR, encodeClaudeProjectPathLegacy(variant)));
  }

  return Array.from(dirs);
}

async function collectTranscriptCandidates(
  projectDirs: string[]
): Promise<TranscriptCandidate[]> {
  const bySessionId = new Map<string, TranscriptCandidate>();

  for (const projectDir of projectDirs) {
    let entries: string[];
    try {
      entries = await readdir(projectDir);
    } catch {
      continue;
    }

    const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles) {
      const sessionId = basename(file, ".jsonl");
      const filePath = join(projectDir, file);
      let mtimeMs = 0;
      try {
        const info = await stat(filePath);
        mtimeMs = info.mtimeMs;
      } catch {
        // Keep unknown mtime as 0.
      }

      const current = bySessionId.get(sessionId);
      if (!current || mtimeMs > current.mtimeMs) {
        bySessionId.set(sessionId, { sessionId, filePath, mtimeMs });
      }
    }
  }

  return Array.from(bySessionId.values()).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function normalizeCommandName(value: string): string | null {
  const text = collapseWhitespace(value);
  if (!text) return null;
  return text.startsWith("/") ? text : `/${text}`;
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
