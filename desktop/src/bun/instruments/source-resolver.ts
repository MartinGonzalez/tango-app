import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  TangoSourceManifest,
  InstrumentSourceConfig,
  InstrumentCatalogEntry,
  InstrumentCategory,
  InstrumentPermission,
  InstrumentPanelConfig,
  InstrumentRuntime,
} from "../../shared/types.ts";

const SOURCES_PATH = join(homedir(), ".tango", "sources.json");
const DEFAULT_SOURCE = "github:MartinGonzalez/tango-instruments";

type PackageJsonManifest = {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  tango?: {
    instrument?: {
      id?: string;
      name?: string;
      description?: string;
      category?: string;
      runtime?: string;
      permissions?: string[];
      panels?: Record<string, boolean>;
      launcher?: {
        sidebarShortcut?: {
          icon?: string;
        };
      };
    };
  };
};

// ── Source config persistence ──

export async function loadSourceConfig(): Promise<InstrumentSourceConfig> {
  try {
    const raw = await readFile(SOURCES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<InstrumentSourceConfig>;
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    if (sources.length === 0) sources.push(DEFAULT_SOURCE);
    return { sources };
  } catch {
    return { sources: [DEFAULT_SOURCE] };
  }
}

export async function saveSourceConfig(config: InstrumentSourceConfig): Promise<void> {
  await mkdir(join(homedir(), ".tango"), { recursive: true });
  await writeFile(SOURCES_PATH, JSON.stringify(config, null, 2));
}

export async function addSource(source: string): Promise<InstrumentSourceConfig> {
  const config = await loadSourceConfig();
  const normalized = source.trim();
  if (!config.sources.includes(normalized)) {
    config.sources.push(normalized);
    await saveSourceConfig(config);
  }
  return config;
}

export async function removeSource(source: string): Promise<InstrumentSourceConfig> {
  const config = await loadSourceConfig();
  config.sources = config.sources.filter((s) => s !== source.trim());
  if (config.sources.length === 0) config.sources.push(DEFAULT_SOURCE);
  await saveSourceConfig(config);
  return config;
}

// ── GitHub raw content fetcher ──

export type GitHubRef = { owner: string; repo: string; branch: string };

function parseGitHubSource(source: string): GitHubRef | null {
  // "github:owner/repo" or "github:owner/repo#branch"
  const match = source.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], branch: match[3] || "main" };
}

async function fetchGitHubFile(ref: GitHubRef, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${path}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ── Resolver ──

export async function resolveGitHubSource(
  source: string,
  ref: GitHubRef,
  installedIds: Set<string>,
): Promise<InstrumentCatalogEntry[]> {
  const tangoJson = await fetchGitHubFile(ref, "tango.json");
  if (!tangoJson) return [];

  let manifest: TangoSourceManifest;
  try {
    manifest = JSON.parse(tangoJson) as TangoSourceManifest;
  } catch {
    return [];
  }

  if (!Array.isArray(manifest.instruments)) return [];

  const entries: InstrumentCatalogEntry[] = [];

  await Promise.all(
    manifest.instruments.map(async (entry) => {
      const instrumentPath = entry.path.replace(/^\.\//, "");
      const pkgPath = instrumentPath === "." ? "package.json" : `${instrumentPath}/package.json`;
      const raw = await fetchGitHubFile(ref, pkgPath);
      if (!raw) return;

      let pkg: PackageJsonManifest;
      try {
        pkg = JSON.parse(raw) as PackageJsonManifest;
      } catch {
        return;
      }

      const inst = pkg.tango?.instrument;
      if (!inst?.id) return;

      const validCategories = ["developer-tools", "productivity", "media", "communication", "finance", "utilities"];
      const category = inst.category && validCategories.includes(inst.category)
        ? (inst.category as InstrumentCategory)
        : undefined;

      entries.push({
        id: inst.id,
        name: inst.name || inst.id,
        description: inst.description || pkg.description,
        category,
        icon: inst.launcher?.sidebarShortcut?.icon,
        author: typeof pkg.author === "string" ? pkg.author : ref.owner,
        version: pkg.version || "0.0.0",
        source,
        path: instrumentPath,
        permissions: (Array.isArray(inst.permissions) ? inst.permissions : []) as InstrumentPermission[],
        panels: {
          sidebar: Boolean(inst.panels?.sidebar),
          first: Boolean(inst.panels?.first),
          second: Boolean(inst.panels?.second),
          right: Boolean(inst.panels?.right),
        } as InstrumentPanelConfig,
        runtime: (inst.runtime === "react" ? "react" : "vanilla") as InstrumentRuntime,
        installed: installedIds.has(inst.id),
      });
    }),
  );

  return entries;
}

export async function resolveAllSources(
  installedIds: Set<string>,
): Promise<InstrumentCatalogEntry[]> {
  const config = await loadSourceConfig();
  const results: InstrumentCatalogEntry[] = [];

  await Promise.all(
    config.sources.map(async (source) => {
      const ref = parseGitHubSource(source);
      if (!ref) return;
      const entries = await resolveGitHubSource(source, ref, installedIds);
      results.push(...entries);
    }),
  );

  return results;
}
