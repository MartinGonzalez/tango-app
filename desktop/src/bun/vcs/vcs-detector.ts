import { stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { VcsKind } from "./types.ts";

/**
 * Detect the VCS type for a workspace directory.
 * Checks .git first (most common), then .svn.
 * Walks up to parent directories to handle subdirectories within a repo.
 */
export async function detectVcs(cwd: string): Promise<VcsKind> {
  let dir = cwd;

  // Walk up at most 50 levels to avoid infinite loops on weird filesystems
  for (let i = 0; i < 50; i++) {
    const hasGit = await exists(join(dir, ".git"));
    if (hasGit) return "git";

    const hasSvn = await isDirectory(join(dir, ".svn"));
    if (hasSvn) return "svn";

    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return "none";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
