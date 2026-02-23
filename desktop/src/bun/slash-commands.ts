import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type {
  SlashCommandEntry,
  SlashCommandSource,
} from "../shared/types.ts";

const CACHE_TTL_MS = 15_000;
const MAX_COMMAND_FILES = 2_000;

type CacheEntry = {
  commands: SlashCommandEntry[];
  loadedAt: number;
};

const cache = new Map<string, CacheEntry>();

export async function getSlashCommands(cwd: string): Promise<SlashCommandEntry[]> {
  const normalizedCwd = cwd.trim();
  if (!normalizedCwd) return [];

  const cached = cache.get(normalizedCwd);
  const age = cached ? Date.now() - cached.loadedAt : Number.POSITIVE_INFINITY;
  if (cached && age < CACHE_TTL_MS) {
    return cached.commands;
  }

  const projectDir = join(normalizedCwd, ".claude", "commands");
  const userDir = join(homedir(), ".claude", "commands");

  const [projectCommands, userCommands] = await Promise.all([
    scanCommands(projectDir, "project"),
    scanCommands(userDir, "user"),
  ]);

  const deduped = dedupeCommands(projectCommands, userCommands);
  cache.set(normalizedCwd, {
    commands: deduped,
    loadedAt: Date.now(),
  });

  return deduped;
}

export function invalidateSlashCommandsCache(cwd?: string): void {
  if (!cwd) {
    cache.clear();
    return;
  }
  cache.delete(cwd);
}

async function scanCommands(
  root: string,
  source: SlashCommandSource
): Promise<SlashCommandEntry[]> {
  const out: SlashCommandEntry[] = [];
  await walkCommands(root, root, source, out);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function walkCommands(
  root: string,
  dir: string,
  source: SlashCommandSource,
  out: SlashCommandEntry[]
): Promise<void> {
  if (out.length >= MAX_COMMAND_FILES) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_COMMAND_FILES) return;
    if (entry.name.startsWith(".")) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkCommands(root, fullPath, source, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;

    const relativePath = relative(root, fullPath);
    const commandName = toCommandName(relativePath);
    if (!commandName) continue;

    out.push({
      name: commandName,
      source,
    });
  }
}

function toCommandName(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("../")) return null;
  if (!normalized.toLowerCase().endsWith(".md")) return null;

  const withoutExtension = normalized.slice(0, -3);
  const segments = withoutExtension
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  return segments.join("/");
}

function dedupeCommands(
  projectCommands: SlashCommandEntry[],
  userCommands: SlashCommandEntry[]
): SlashCommandEntry[] {
  const byName = new Map<string, SlashCommandEntry>();

  for (const command of projectCommands) {
    byName.set(command.name, command);
  }
  for (const command of userCommands) {
    if (!byName.has(command.name)) {
      byName.set(command.name, command);
    }
  }

  return [...byName.values()];
}
