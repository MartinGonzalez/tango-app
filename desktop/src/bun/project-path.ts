import { realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";

/**
 * Claude stores stage transcript directories by replacing path separators
 * and punctuation with "-".
 */
export function encodeClaudeProjectPath(cwd: string): string {
  return String(cwd ?? "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Backward-compatible encoder used by older code paths.
 */
export function encodeClaudeProjectPathLegacy(cwd: string): string {
  return String(cwd ?? "").replace(/\//g, "-");
}

/**
 * Return both the original stage path and its canonical realpath
 * (when available) so transcript lookup works across symlinks (/var -> /private/var).
 */
export async function getStagePathVariants(cwd: string): Promise<string[]> {
  const normalized = String(cwd ?? "").trim();
  const variants = new Set<string>();
  if (!normalized) return [];
  variants.add(normalized);

  try {
    const resolved = await realpath(normalized);
    if (resolved) variants.add(resolved);
  } catch {
    // Ignore non-existent stages or resolution failures.
  }

  return Array.from(variants);
}

export function getStagePathVariantsSync(cwd: string): string[] {
  const normalized = String(cwd ?? "").trim();
  const variants = new Set<string>();
  if (!normalized) return [];
  variants.add(normalized);

  try {
    const resolved = realpathSync(normalized);
    if (resolved) variants.add(resolved);
  } catch {
    // Ignore non-existent stages or resolution failures.
  }

  return Array.from(variants);
}
