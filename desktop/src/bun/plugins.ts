import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { InstalledPlugin, PluginItem, PluginItemKind } from "../shared/types.ts";

type InstalledPluginsManifest = {
  plugins?: Record<string, PluginInstallRecord[]>;
};

type PluginInstallRecord = {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
};

type PluginBlocklist = {
  plugins?: Array<{
    plugin?: string;
  }>;
};

type PluginMetadata = {
  name?: string;
  version?: string;
  description?: string;
  author?: {
    name?: string;
  } | string;
};

type FrontmatterResult = {
  attributes: Record<string, string>;
  body: string;
};

const DEFAULT_PLUGINS_DIR = join(homedir(), ".claude", "plugins");
const CACHE_TTL_MS = 15_000;

let cachedPlugins: InstalledPlugin[] | null = null;
let cacheLoadedAt = 0;

export async function getInstalledPlugins(
  pluginsDir: string = DEFAULT_PLUGINS_DIR
): Promise<InstalledPlugin[]> {
  const now = Date.now();
  if (pluginsDir === DEFAULT_PLUGINS_DIR && cachedPlugins && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedPlugins;
  }

  const manifestPath = join(pluginsDir, "installed_plugins.json");
  const manifest = await readJsonSafe<InstalledPluginsManifest>(manifestPath);
  if (!manifest?.plugins) {
    if (pluginsDir === DEFAULT_PLUGINS_DIR) {
      cachedPlugins = [];
      cacheLoadedAt = now;
    }
    return [];
  }

  const disabled = await loadDisabledPlugins(pluginsDir);
  const out: InstalledPlugin[] = [];

  for (const [pluginId, installs] of Object.entries(manifest.plugins)) {
    const install = selectInstall(installs);
    if (!install?.installPath) continue;

    const plugin = await buildInstalledPlugin(pluginId, install, disabled);
    if (plugin) out.push(plugin);
  }

  out.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "enabled" ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  if (pluginsDir === DEFAULT_PLUGINS_DIR) {
    cachedPlugins = out;
    cacheLoadedAt = now;
  }

  return out;
}

export function invalidateInstalledPluginsCache(): void {
  cachedPlugins = null;
  cacheLoadedAt = 0;
}

async function buildInstalledPlugin(
  pluginId: string,
  install: PluginInstallRecord,
  disabled: Set<string>
): Promise<InstalledPlugin | null> {
  const installPath = install.installPath?.trim();
  if (!installPath) return null;

  const parsed = parsePluginId(pluginId);
  const metadataPath = join(installPath, ".claude-plugin", "plugin.json");
  const metadata = await readJsonSafe<PluginMetadata>(metadataPath);

  const commands = await scanMarkdownItems(
    join(installPath, "commands"),
    "command",
    (relativePath, frontmatter) => {
      const withoutExt = stripMdExt(relativePath);
      return `/${withoutExt}`;
    }
  );

  const agents = await scanMarkdownItems(
    join(installPath, "agents"),
    "agent",
    (relativePath, frontmatter) => {
      const frontmatterName = frontmatter.attributes.name?.trim();
      if (frontmatterName) return frontmatterName;
      return stripMdExt(relativePath).split("/").at(-1) ?? stripMdExt(relativePath);
    }
  );

  const skills = await scanSkillItems(join(installPath, "skills"));

  return {
    id: pluginId,
    pluginName: parsed.pluginName,
    displayName: toDisplayName(metadata?.name ?? parsed.pluginName),
    marketplace: parsed.marketplace,
    sourceLabel: `Marketplace (${parsed.marketplace})`,
    version: install.version ?? metadata?.version ?? null,
    description: String(metadata?.description ?? "").trim(),
    authorName: resolveAuthorName(metadata?.author),
    installPath,
    installedAt: normalizeIsoDate(install.installedAt),
    lastUpdated: normalizeIsoDate(install.lastUpdated),
    status: disabled.has(pluginId.toLowerCase()) ? "disabled" : "enabled",
    commands,
    agents,
    skills,
  };
}

function parsePluginId(pluginId: string): { pluginName: string; marketplace: string } {
  const trimmed = pluginId.trim();
  const idx = trimmed.lastIndexOf("@");
  if (idx <= 0) {
    return {
      pluginName: trimmed || pluginId,
      marketplace: "unknown",
    };
  }
  return {
    pluginName: trimmed.slice(0, idx),
    marketplace: trimmed.slice(idx + 1) || "unknown",
  };
}

function selectInstall(installs: PluginInstallRecord[] | undefined): PluginInstallRecord | null {
  if (!Array.isArray(installs) || installs.length === 0) return null;

  let selected: PluginInstallRecord | null = null;
  let selectedTime = Number.NEGATIVE_INFINITY;

  for (const install of installs) {
    const timestamp = parseTimestamp(
      install.lastUpdated ?? install.installedAt ?? ""
    );
    if (!selected || timestamp >= selectedTime) {
      selected = install;
      selectedTime = timestamp;
    }
  }

  return selected;
}

async function loadDisabledPlugins(pluginsDir: string): Promise<Set<string>> {
  const blocklistPath = join(pluginsDir, "blocklist.json");
  const blocklist = await readJsonSafe<PluginBlocklist>(blocklistPath);
  const out = new Set<string>();

  for (const entry of blocklist?.plugins ?? []) {
    const plugin = String(entry?.plugin ?? "").trim().toLowerCase();
    if (plugin) out.add(plugin);
  }

  return out;
}

async function scanMarkdownItems(
  root: string,
  kind: PluginItemKind,
  resolveName: (relativePath: string, frontmatter: FrontmatterResult) => string
): Promise<PluginItem[]> {
  const filePaths = await collectFiles(root, (path) => path.toLowerCase().endsWith(".md"));
  const items: PluginItem[] = [];

  for (const filePath of filePaths) {
    const relativePath = toRelative(root, filePath);
    const raw = await readTextSafe(filePath);
    if (!raw) continue;

    const frontmatter = parseFrontmatter(raw);
    const name = resolveName(relativePath, frontmatter).trim();
    const description = resolveDescription(frontmatter);
    const updatedAt = await readUpdatedAt(filePath);

    items.push({
      id: `${kind}:${stripMdExt(relativePath)}`,
      kind,
      name: name || stripMdExt(relativePath),
      description,
      content: raw.trim(),
      relativePath,
      updatedAt,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

async function scanSkillItems(root: string): Promise<PluginItem[]> {
  const filePaths = await collectFiles(
    root,
    (path) => path.toLowerCase().endsWith("/skill.md")
  );
  const items: PluginItem[] = [];

  for (const filePath of filePaths) {
    const relativePath = toRelative(root, filePath);
    const raw = await readTextSafe(filePath);
    if (!raw) continue;

    const frontmatter = parseFrontmatter(raw);
    const pathParts = stripMdExt(relativePath).split("/");
    const folderName = pathParts.length >= 2
      ? pathParts[pathParts.length - 2]
      : pathParts[pathParts.length - 1];
    const frontmatterName = frontmatter.attributes.name?.trim();
    const name = frontmatterName || folderName || stripMdExt(relativePath);

    items.push({
      id: `skill:${stripMdExt(relativePath)}`,
      kind: "skill",
      name,
      description: resolveDescription(frontmatter),
      content: raw.trim(),
      relativePath,
      updatedAt: await readUpdatedAt(filePath),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

async function collectFiles(
  root: string,
  matcher: (normalizedPath: string) => boolean
): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out, matcher);
  return out;
}

async function walk(
  dir: string,
  out: string[],
  matcher: (normalizedPath: string) => boolean
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, out, matcher);
      continue;
    }
    if (!entry.isFile()) continue;

    const normalized = fullPath.replace(/\\/g, "/").toLowerCase();
    if (matcher(normalized)) {
      out.push(fullPath);
    }
  }
}

async function readTextSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function readUpdatedAt(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    return normalizeIsoDate(info.mtime.toISOString());
  } catch {
    return null;
  }
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseFrontmatter(raw: string): FrontmatterResult {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      attributes: {},
      body: raw,
    };
  }

  const attributes: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = stripQuotes(kv[2].trim());
    attributes[key] = value;
  }

  return {
    attributes,
    body: match[2],
  };
}

function resolveDescription(frontmatter: FrontmatterResult): string {
  const fromMeta = frontmatter.attributes.description?.trim();
  if (fromMeta) return fromMeta;

  for (const line of frontmatter.body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;

    const bullet = trimmed.replace(/^[-*]\s+/, "").trim();
    if (bullet) return bullet;
  }

  return "";
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function resolveAuthorName(author: PluginMetadata["author"]): string | null {
  if (typeof author === "string") {
    const normalized = author.trim();
    return normalized || null;
  }
  if (author && typeof author === "object") {
    const normalized = String(author.name ?? "").trim();
    return normalized || null;
  }
  return null;
}

function toDisplayName(input: string): string {
  const text = String(input ?? "").trim();
  if (!text) return "Plugin";

  return text
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toRelative(root: string, fullPath: string): string {
  return relative(root, fullPath).replace(/\\/g, "/");
}

function stripMdExt(path: string): string {
  return path.replace(/\.md$/i, "");
}

function normalizeIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}
