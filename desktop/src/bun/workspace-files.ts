import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const CACHE_TTL_MS = 30_000;
const MAX_FILES = 12_000;
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
]);

type CacheEntry = {
  files: string[];
  scannedAt: number;
};

const cache = new Map<string, CacheEntry>();

export async function getWorkspaceFiles(cwd: string): Promise<string[]> {
  const now = Date.now();
  const cached = cache.get(cwd);
  if (cached && now - cached.scannedAt < CACHE_TTL_MS) {
    return cached.files;
  }

  const files: string[] = [];
  await walk(cwd, cwd, files);
  files.sort((a, b) => a.localeCompare(b));

  cache.set(cwd, {
    files,
    scannedAt: now,
  });

  return files;
}

export function invalidateWorkspaceFilesCache(cwd?: string): void {
  if (cwd) {
    cache.delete(cwd);
    return;
  }
  cache.clear();
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  if (out.length >= MAX_FILES) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walk(root, fullPath, out);
      continue;
    }

    if (!entry.isFile()) continue;

    const relPath = relative(root, fullPath);
    if (!relPath || relPath.startsWith("..")) continue;
    out.push(relPath);
  }
}
