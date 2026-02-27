import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  InstrumentBackendContext,
  InstrumentBackendModule,
  InstrumentEvent,
  InstrumentRegistryEntry,
} from "../../shared/types.ts";
import { loadInstrumentManifest } from "./loader.ts";
import { requirePermission } from "./permissions.ts";
import { InstrumentRegistry } from "./registry.ts";
import { InstrumentStorage } from "./storage.ts";

type InvokeHandler = (
  ctx: InstrumentBackendContext,
  method: string,
  params: Record<string, unknown> | undefined
) => Promise<unknown>;

type LoadedBackendModule = {
  invoke: InstrumentBackendModule["invoke"];
  absoluteEntrypoint: string;
};

export class InstrumentRuntime {
  #registry: InstrumentRegistry;
  #storage: InstrumentStorage;
  #bundledInstallPaths: string[];
  #invokeHandlers: Record<string, InvokeHandler>;
  #onEvent: ((event: InstrumentEvent) => void) | null;
  #backendModuleCache = new Map<string, LoadedBackendModule>();

  constructor(opts?: {
    registry?: InstrumentRegistry;
    storage?: InstrumentStorage;
    bundledInstallPaths?: string[];
    invokeHandlers?: Record<string, InvokeHandler>;
    onEvent?: (event: InstrumentEvent) => void;
  }) {
    this.#registry = opts?.registry ?? new InstrumentRegistry();
    this.#storage = opts?.storage ?? new InstrumentStorage();
    this.#bundledInstallPaths = (opts?.bundledInstallPaths ?? []).map((value) =>
      resolve(String(value))
    );
    this.#invokeHandlers = opts?.invokeHandlers ?? {};
    this.#onEvent = opts?.onEvent ?? null;
  }

  get registryPath(): string {
    return this.#registry.filePath;
  }

  async load(): Promise<InstrumentRegistryEntry[]> {
    await this.#registry.load();
    await this.#syncBundledInstruments();
    return this.list();
  }

  list(): InstrumentRegistryEntry[] {
    return this.#registry.list();
  }

  get(instrumentId: string): InstrumentRegistryEntry | null {
    return this.#registry.get(instrumentId);
  }

  async installFromPath(path: string): Promise<InstrumentRegistryEntry> {
    const loaded = await loadInstrumentManifest(path);
    const existing = this.#registry.get(loaded.manifest.id);
    if (existing?.isBundled) {
      throw new Error(
        `Instrument '${loaded.manifest.id}' is bundled and cannot be replaced by local install`
      );
    }

    const entry: InstrumentRegistryEntry = {
      id: loaded.manifest.id,
      name: loaded.manifest.name,
      group: loaded.manifest.group,
      source: "local",
      installPath: loaded.installPath,
      manifestPath: loaded.manifestPath,
      entrypoint: loaded.manifest.entrypoint,
      ...(loaded.manifest.backendEntrypoint
        ? { backendEntrypoint: loaded.manifest.backendEntrypoint }
        : {}),
      hostApiVersion: loaded.manifest.hostApiVersion,
      panels: loaded.manifest.panels,
      permissions: loaded.manifest.permissions,
      enabled: true,
      status: "active",
      version: loaded.version,
      isBundled: false,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.#registry.upsert(entry);
    this.#backendModuleCache.delete(saved.id);
    return saved;
  }

  async setEnabled(
    instrumentId: string,
    enabled: boolean
  ): Promise<InstrumentRegistryEntry> {
    const entry = this.#requireEntry(instrumentId);
    const updated = await this.#registry.upsert({
      ...entry,
      enabled,
      status: enabled
        ? (
            entry.status === "blocked" || Boolean(entry.lastError)
              ? "blocked"
              : "active"
          )
        : "disabled",
    });

    if (!enabled) {
      this.#backendModuleCache.delete(instrumentId);
    }

    return updated;
  }

  async remove(
    instrumentId: string,
    opts?: { deleteData?: boolean }
  ): Promise<{ removed: boolean; dataDeleted: boolean }> {
    const entry = this.#requireEntry(instrumentId);
    if (entry.isBundled) {
      throw new Error(`Bundled instrument '${instrumentId}' cannot be uninstalled`);
    }

    const removed = await this.#registry.remove(instrumentId);
    this.#backendModuleCache.delete(instrumentId);

    let dataDeleted = false;
    if (removed && opts?.deleteData) {
      await this.#storage.deleteInstrumentData(instrumentId);
      dataDeleted = true;
    }

    return { removed, dataDeleted };
  }

  async markBlocked(instrumentId: string, error: string): Promise<void> {
    const entry = this.#requireEntry(instrumentId);
    await this.#registry.upsert({
      ...entry,
      status: "blocked",
      enabled: true,
      lastError: String(error || "Unknown migration error"),
    });
  }

  async clearError(instrumentId: string): Promise<void> {
    const entry = this.#requireEntry(instrumentId);
    await this.#registry.upsert({
      ...entry,
      status: entry.enabled ? "active" : "disabled",
      lastError: null,
    });
  }

  async invoke(
    instrumentId: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const entry = this.#requireUsableEntry(instrumentId);
    const ctx = this.#buildContext(entry);
    const handler = this.#invokeHandlers[entry.id];
    if (handler) {
      return handler(ctx, method, params);
    }

    const module = await this.#loadBackendModule(entry);
    return module.invoke(ctx, method, params);
  }

  async getProperty(instrumentId: string, key: string): Promise<unknown | null> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.properties");
    return this.#storage.getProperty(entry.id, key);
  }

  async setProperty(instrumentId: string, key: string, value: unknown): Promise<void> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.properties");
    await this.#storage.setProperty(entry.id, key, value);
  }

  async deleteProperty(instrumentId: string, key: string): Promise<void> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.properties");
    await this.#storage.deleteProperty(entry.id, key);
  }

  async readFile(
    instrumentId: string,
    filePath: string,
    encoding: "utf8" | "base64" = "utf8"
  ): Promise<string> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.files");
    return this.#storage.readFile(entry.id, filePath, encoding);
  }

  async writeFile(
    instrumentId: string,
    filePath: string,
    content: string,
    encoding: "utf8" | "base64" = "utf8"
  ): Promise<void> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.files");
    await this.#storage.writeFile(entry.id, filePath, content, encoding);
  }

  async deleteFile(instrumentId: string, filePath: string): Promise<void> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.files");
    await this.#storage.deleteFile(entry.id, filePath);
  }

  async listFiles(instrumentId: string, dir?: string): Promise<string[]> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.files");
    return this.#storage.listFiles(entry.id, dir ?? "");
  }

  async sqlQuery(
    instrumentId: string,
    sql: string,
    params?: unknown[],
    db?: string
  ): Promise<Record<string, unknown>[]> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.db");
    return this.#storage.sqlQuery(entry.id, sql, params ?? [], db ?? "main");
  }

  async sqlExecute(
    instrumentId: string,
    sql: string,
    params?: unknown[],
    db?: string
  ): Promise<{ changes: number; lastInsertRowid: number | null }> {
    const entry = this.#requireUsableEntry(instrumentId);
    requirePermission(entry, "storage.db");
    return this.#storage.sqlExecute(entry.id, sql, params ?? [], db ?? "main");
  }

  #buildContext(entry: InstrumentRegistryEntry): InstrumentBackendContext {
    return {
      instrumentId: entry.id,
      permissions: entry.permissions,
      emit: ({ event, payload }) => {
        this.#onEvent?.({
          instrumentId: entry.id,
          event,
          payload,
        });
      },
    };
  }

  #requireEntry(instrumentId: string): InstrumentRegistryEntry {
    const entry = this.#registry.get(instrumentId);
    if (!entry) {
      throw new Error(`Instrument '${instrumentId}' is not installed`);
    }
    return entry;
  }

  #requireUsableEntry(instrumentId: string): InstrumentRegistryEntry {
    const entry = this.#requireEntry(instrumentId);
    if (!entry.enabled || entry.status === "disabled") {
      throw new Error(`Instrument '${instrumentId}' is disabled`);
    }
    if (entry.status === "blocked") {
      throw new Error(
        entry.lastError
          ? `Instrument '${instrumentId}' is blocked: ${entry.lastError}`
          : `Instrument '${instrumentId}' is blocked`
      );
    }
    return entry;
  }

  async #syncBundledInstruments(): Promise<void> {
    for (const installPath of this.#bundledInstallPaths) {
      const loaded = await loadInstrumentManifest(installPath);
      const existing = this.#registry.get(loaded.manifest.id);

      const status = existing?.status === "blocked" ? "blocked" : "active";
      const entry: InstrumentRegistryEntry = {
        id: loaded.manifest.id,
        name: loaded.manifest.name,
        group: loaded.manifest.group,
        source: "bundled",
        installPath: loaded.installPath,
        manifestPath: loaded.manifestPath,
        entrypoint: loaded.manifest.entrypoint,
        ...(loaded.manifest.backendEntrypoint
          ? { backendEntrypoint: loaded.manifest.backendEntrypoint }
          : {}),
        hostApiVersion: loaded.manifest.hostApiVersion,
        panels: loaded.manifest.panels,
        permissions: loaded.manifest.permissions,
        enabled: existing?.enabled ?? true,
        status,
        version: loaded.version,
        isBundled: true,
        lastError: existing?.lastError ?? null,
        updatedAt: new Date().toISOString(),
      };

      await this.#registry.upsert(entry);
    }
  }

  async #loadBackendModule(
    entry: InstrumentRegistryEntry
  ): Promise<LoadedBackendModule> {
    const cached = this.#backendModuleCache.get(entry.id);
    const absoluteEntrypoint = resolve(
      entry.installPath,
      entry.backendEntrypoint ?? entry.entrypoint
    );
    if (cached && cached.absoluteEntrypoint === absoluteEntrypoint) {
      return cached;
    }

    const href = pathToFileURL(absoluteEntrypoint).href;
    const imported = await import(`${href}?t=${Date.now()}`);
    const moduleLike = (imported.default ?? imported) as Partial<InstrumentBackendModule>;
    if (!moduleLike || typeof moduleLike.invoke !== "function") {
      throw new Error(
        `Instrument backend module '${entry.id}' must export an invoke(ctx, method, params) function`
      );
    }

    const loaded: LoadedBackendModule = {
      invoke: moduleLike.invoke.bind(moduleLike),
      absoluteEntrypoint,
    };

    this.#backendModuleCache.set(entry.id, loaded);
    return loaded;
  }
}
