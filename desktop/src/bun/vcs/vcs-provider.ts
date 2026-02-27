import { detectVcs } from "./vcs-detector.ts";
import { GitStrategy } from "./git-strategy.ts";
import { SvnStrategy } from "./svn-strategy.ts";
import { NoneStrategy } from "./none-strategy.ts";
import type { VcsKind, VcsInfo, VcsStrategy } from "./types.ts";

type CacheEntry = {
  strategy: VcsStrategy;
  cachedAt: number;
};

const CACHE_TTL_MS = 30_000; // 30 seconds
const cache = new Map<string, CacheEntry>();

const strategyInstances: Record<VcsKind, VcsStrategy> = {
  git: new GitStrategy(),
  svn: new SvnStrategy(),
  none: new NoneStrategy(),
};

/**
 * Get the VCS strategy for a stage, with per-cwd caching.
 * Cache expires after 30s to handle branch switches / VCS init.
 */
export async function getVcsStrategy(cwd: string): Promise<VcsStrategy> {
  const now = Date.now();
  const cached = cache.get(cwd);

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.strategy;
  }

  const kind = await detectVcs(cwd);
  const strategy = strategyInstances[kind];

  cache.set(cwd, { strategy, cachedAt: now });
  return strategy;
}

/**
 * Get VCS info (kind + branch name) for a stage.
 */
export async function getVcsInfo(cwd: string): Promise<VcsInfo> {
  const strategy = await getVcsStrategy(cwd);
  const branch = await strategy.getBranch(cwd);
  return { kind: strategy.kind, branch };
}

/**
 * Invalidate the cached VCS strategy for a stage.
 * Call when a stage is removed or VCS state may have changed.
 */
export function invalidateVcsCache(cwd: string): void {
  cache.delete(cwd);
}
