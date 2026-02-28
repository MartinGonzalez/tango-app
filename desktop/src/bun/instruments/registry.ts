import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  InstrumentRegistryEntry,
  InstrumentRegistryFile,
} from "../../shared/types.ts";

const REGISTRY_VERSION = 1;
const DEFAULT_REGISTRY_PATH = join(homedir(), ".tango", "instruments", "registry.json");

export class InstrumentRegistry {
  #filePath: string;
  #entries: InstrumentRegistryEntry[] = [];
  #loaded = false;

  constructor(filePath: string = DEFAULT_REGISTRY_PATH) {
    this.#filePath = filePath;
  }

  get filePath(): string {
    return this.#filePath;
  }

  async load(): Promise<void> {
    if (this.#loaded) return;

    try {
      const raw = await readFile(this.#filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<InstrumentRegistryFile>;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      this.#entries = entries
        .filter((entry): entry is InstrumentRegistryEntry => {
          return Boolean(entry && typeof entry.id === "string");
        })
        .map((entry) => ({
          ...entry,
          source: entry.source === "local" ? "local" : "bundled",
          runtime: entry.runtime === "react" ? "react" : "vanilla",
          status: normalizeStatus(entry.status),
          lastError: entry.lastError ?? null,
          permissions: Array.isArray(entry.permissions) ? entry.permissions : [],
          settings: Array.isArray(entry.settings) ? entry.settings : [],
          launcher: normalizeLauncher(entry.launcher),
          panels: entry.panels ?? {
            sidebar: true,
            first: false,
            second: true,
            right: false,
          },
          updatedAt: entry.updatedAt ?? new Date().toISOString(),
        }));
    } catch {
      this.#entries = [];
    }

    this.#loaded = true;
  }

  list(): InstrumentRegistryEntry[] {
    return this.#entries
      .slice()
      .sort((left, right) => {
        if (left.group !== right.group) {
          return left.group.localeCompare(right.group);
        }
        return left.name.localeCompare(right.name);
      });
  }

  get(id: string): InstrumentRegistryEntry | null {
    return this.#entries.find((entry) => entry.id === id) ?? null;
  }

  async upsert(entry: InstrumentRegistryEntry): Promise<InstrumentRegistryEntry> {
    await this.load();
    const now = new Date().toISOString();
    const next = { ...entry, updatedAt: now };
    const existingIndex = this.#entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      this.#entries[existingIndex] = next;
    } else {
      this.#entries.push(next);
    }
    await this.save();
    return next;
  }

  async remove(id: string): Promise<boolean> {
    await this.load();
    const before = this.#entries.length;
    this.#entries = this.#entries.filter((entry) => entry.id !== id);
    const removed = this.#entries.length !== before;
    if (removed) {
      await this.save();
    }
    return removed;
  }

  async save(): Promise<void> {
    const payload: InstrumentRegistryFile = {
      version: REGISTRY_VERSION,
      entries: this.#entries,
    };
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(payload, null, 2));
  }
}

function normalizeStatus(
  value: string | null | undefined
): InstrumentRegistryEntry["status"] {
  if (value === "active" || value === "disabled" || value === "error" || value === "blocked") {
    return value;
  }
  return "active";
}

function normalizeLauncher(
  launcher: InstrumentRegistryEntry["launcher"] | null | undefined
): InstrumentRegistryEntry["launcher"] | undefined {
  if (!launcher || typeof launcher !== "object") return undefined;
  const raw = launcher.sidebarShortcut;
  if (!raw || typeof raw !== "object") return undefined;
  return {
    sidebarShortcut: {
      enabled: Boolean(raw.enabled),
      ...(raw.label ? { label: String(raw.label).trim() } : {}),
      ...(raw.icon ? { icon: String(raw.icon).trim() } : {}),
      ...(Number.isFinite(Number(raw.order)) ? { order: Number(raw.order) } : {}),
    },
  };
}
