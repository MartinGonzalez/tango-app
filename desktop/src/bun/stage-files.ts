import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { StageFileContent } from "../shared/types.ts";

const CACHE_TTL_MS = 30_000;
const MAX_FILES = 12_000;
const DEFAULT_MAX_FILE_BYTES = 300_000;
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

export async function getStageFiles(cwd: string): Promise<string[]> {
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

export async function getStageFileContent(
  cwd: string,
  path: string,
  maxBytes = DEFAULT_MAX_FILE_BYTES
): Promise<StageFileContent> {
  if (!cwd) {
    throw new Error("Missing stage path");
  }
  if (!path) {
    throw new Error("Missing file path");
  }

  const root = resolve(cwd);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Invalid file path");
  }

  const limit = Number.isFinite(maxBytes) && maxBytes > 0
    ? Math.min(Math.floor(maxBytes), 2_000_000)
    : DEFAULT_MAX_FILE_BYTES;

  const bytes = await readFile(target);
  const truncated = bytes.byteLength > limit;
  const slice = truncated ? bytes.subarray(0, limit) : bytes;

  if (isProbablyBinary(slice)) {
    return {
      content: "",
      truncated,
      isBinary: true,
    };
  }

  return {
    content: slice.toString("utf8"),
    truncated,
    isBinary: false,
  };
}

export function invalidateStageFilesCache(cwd?: string): void {
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

function isProbablyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;

  const sampleLength = Math.min(bytes.length, 8192);
  let suspicious = 0;

  for (let i = 0; i < sampleLength; i++) {
    const value = bytes[i];
    if (value === 0) return true;

    const isControl =
      value < 7
      || (value > 14 && value < 32);
    if (isControl) suspicious++;
  }

  return suspicious / sampleLength > 0.2;
}
