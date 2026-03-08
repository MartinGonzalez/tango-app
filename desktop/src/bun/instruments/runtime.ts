import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ActionSchema,
  ConnectorCredential,
  ConnectorProvider,
  HostEventMap,
  InstrumentBackendContext,
  InstrumentBackendDefinition,
  InstrumentBackgroundRefreshContext,
  InstrumentEvent,
  InstrumentRegistryEntry,
  InstrumentSettingField,
  SessionInfo,
  StageConnector,
} from "../../shared/types.ts";
import { loadInstrumentManifest } from "./loader.ts";
import { requirePermission } from "./permissions.ts";
import { InstrumentRegistry } from "./registry.ts";
import { InstrumentStorage } from "./storage.ts";

type LoadedBackendModule = {
  definition: InstrumentBackendDefinition | null;
  absoluteEntrypoint: string | null;
  activated: boolean;
  suspended: boolean;
};

type BackgroundSchedulerState = {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  abortController: AbortController | null;
};

type BackendEventHandler = (payload: unknown) => void | Promise<void>;

type HostApi = {
  sessions: {
    start: (params: {
      prompt: string;
      cwd: string;
      fullAccess?: boolean;
      sessionId?: string;
      selectedFiles?: string[];
      model?: string;
      tools?: string[];
    }) => Promise<{ sessionId: string }>;
    sendFollowUp: (params: {
      sessionId: string;
      text: string;
      fullAccess?: boolean;
      selectedFiles?: string[];
    }) => Promise<void>;
    kill: (sessionId: string) => Promise<void>;
    list: () => Promise<SessionInfo[]>;
    query?: (params: {
      prompt: string;
      cwd?: string;
      model?: string;
      tools?: string[];
      sessionId?: string;
    }) => Promise<{
      text: string;
      durationMs: number;
      costUsd: number;
    }>;
  };
  connectors: {
    listStageConnectors: (stagePath: string) => Promise<StageConnector[]>;
    getCredential: (
      stagePath: string,
      provider: ConnectorProvider
    ) => Promise<ConnectorCredential>;
    connect: (
      stagePath: string,
      provider: ConnectorProvider
    ) => Promise<{
      id: string;
      stagePath: string;
      provider: ConnectorProvider;
      status: string;
      authorizeUrl: string | null;
      error: string | null;
      expiresAt: string;
      updatedAt: string;
    }>;
    disconnect: (stagePath: string, provider: ConnectorProvider) => Promise<void>;
  };
  stages: {
    list: () => Promise<string[]>;
    active: () => Promise<string | null>;
  };
};

const EVENT_PERMISSION_MAP: Record<keyof HostEventMap, "sessions" | "stages.observe" | "connectors.read"> = {
  "snapshot.update": "stages.observe",
  "session.stream": "sessions",
  "session.idResolved": "sessions",
  "session.ended": "sessions",
  "tool.approval": "sessions",
  "pullRequest.agentReviewChanged": "stages.observe",
  "instrument.event": "stages.observe",
  "stage.added": "stages.observe",
  "stage.removed": "stages.observe",
  "connector.auth.changed": "connectors.read",
};

export class InstrumentRuntime {
  #registry: InstrumentRegistry;
  #storage: InstrumentStorage;
  #bundledInstallPaths: string[];
  #onEvent: ((event: InstrumentEvent) => void) | null;
  #onLog: ((entry: { instrumentId: string; level: string; message: string; detail?: unknown }) => void) | null;
  #hostApi: HostApi;
  #backendModuleCache = new Map<string, LoadedBackendModule>();
  #backendSubscriptions = new Map<string, Map<keyof HostEventMap, Set<BackendEventHandler>>>();
  #backgroundSchedulers = new Map<string, BackgroundSchedulerState>();
  #devOverrides = new Map<string, InstrumentRegistryEntry>();

  constructor(opts?: {
    registry?: InstrumentRegistry;
    storage?: InstrumentStorage;
    bundledInstallPaths?: string[];
    onEvent?: (event: InstrumentEvent) => void;
    onLog?: (entry: { instrumentId: string; level: string; message: string; detail?: unknown }) => void;
    hostApi?: HostApi;
  }) {
    this.#registry = opts?.registry ?? new InstrumentRegistry();
    this.#storage = opts?.storage ?? new InstrumentStorage();
    this.#bundledInstallPaths = (opts?.bundledInstallPaths ?? []).map((value) =>
      resolve(String(value))
    );
    this.#onEvent = opts?.onEvent ?? null;
    this.#onLog = opts?.onLog ?? null;
    this.#hostApi = opts?.hostApi ?? {
      sessions: {
        start: async () => {
          throw new Error("sessions.start host API is not configured");
        },
        sendFollowUp: async () => {
          throw new Error("sessions.sendFollowUp host API is not configured");
        },
        kill: async () => {
          throw new Error("sessions.kill host API is not configured");
        },
        list: async () => [],
      },
      connectors: {
        listStageConnectors: async () => [],
        getCredential: async () => {
          throw new Error("connectors.getCredential host API is not configured");
        },
        connect: async () => {
          throw new Error("connectors.connect host API is not configured");
        },
        disconnect: async () => {
          throw new Error("connectors.disconnect host API is not configured");
        },
      },
      stages: {
        list: async () => [],
        active: async () => null,
      },
    };
  }

  get registryPath(): string {
    return this.#registry.filePath;
  }

  async load(): Promise<InstrumentRegistryEntry[]> {
    await this.#registry.load();
    await this.#syncBundledInstruments();
    const entries = this.list();
    for (const entry of entries) {
      if (!entry.enabled || entry.status === "disabled" || entry.status === "blocked") continue;
      await this.#activateBackend(entry).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        void this.markBlocked(entry.id, message);
      });
    }
    return this.list();
  }

  list(): InstrumentRegistryEntry[] {
    const registryEntries = this.#registry.list();
    if (this.#devOverrides.size === 0) return registryEntries;
    // Append dev entries alongside registry entries — both are visible
    return [...registryEntries, ...this.#devOverrides.values()];
  }

  get(instrumentId: string): InstrumentRegistryEntry | null {
    return this.#devOverrides.get(instrumentId) ?? this.#registry.get(instrumentId);
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
      ...(loaded.manifest.description ? { description: loaded.manifest.description } : {}),
      group: loaded.manifest.group,
      ...(loaded.manifest.category ? { category: loaded.manifest.category } : {}),
      source: "local",
      installPath: loaded.installPath,
      manifestPath: loaded.manifestPath,
      runtime: loaded.manifest.runtime ?? "vanilla",
      entrypoint: loaded.manifest.entrypoint,
      ...(loaded.manifest.backendEntrypoint
        ? { backendEntrypoint: loaded.manifest.backendEntrypoint }
        : {}),
      hostApiVersion: loaded.manifest.hostApiVersion,
      panels: loaded.manifest.panels,
      permissions: loaded.manifest.permissions,
      settings: loaded.manifest.settings ?? [],
      launcher: loaded.manifest.launcher,
      ...(loaded.manifest.backgroundRefresh ? { backgroundRefresh: loaded.manifest.backgroundRefresh } : {}),
      enabled: true,
      status: "active",
      version: loaded.version,
      isBundled: false,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.#registry.upsert(entry);
    this.#backendModuleCache.delete(saved.id);
    await this.#activateBackend(saved).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      void this.markBlocked(saved.id, message);
    });
    return this.#requireEntry(saved.id);
  }

  /**
   * Install an instrument as a dev entry (in-memory only).
   * Creates a separate entry with id `{originalId}::dev` so both the
   * marketplace version and the dev version appear side by side.
   * Disappears on app restart — registry.json is never touched.
   */
  async installDevOverride(path: string): Promise<InstrumentRegistryEntry> {
    const loaded = await loadInstrumentManifest(path);
    const baseId = loaded.manifest.id;
    const devId = `${baseId}::dev`;

    const existing = this.#registry.get(baseId);
    if (existing?.isBundled) {
      throw new Error(
        `Instrument '${baseId}' is bundled and cannot be overridden by dev mode`
      );
    }

    const entry: InstrumentRegistryEntry = {
      id: devId,
      name: loaded.manifest.name,
      ...(loaded.manifest.description ? { description: loaded.manifest.description } : {}),
      group: loaded.manifest.group,
      ...(loaded.manifest.category ? { category: loaded.manifest.category } : {}),
      source: "local",
      installPath: loaded.installPath,
      manifestPath: loaded.manifestPath,
      runtime: loaded.manifest.runtime ?? "vanilla",
      entrypoint: loaded.manifest.entrypoint,
      ...(loaded.manifest.backendEntrypoint
        ? { backendEntrypoint: loaded.manifest.backendEntrypoint }
        : {}),
      hostApiVersion: loaded.manifest.hostApiVersion,
      panels: loaded.manifest.panels,
      permissions: loaded.manifest.permissions,
      settings: loaded.manifest.settings ?? [],
      launcher: loaded.manifest.launcher,
      ...(loaded.manifest.backgroundRefresh ? { backgroundRefresh: loaded.manifest.backgroundRefresh } : {}),
      enabled: true,
      status: "active",
      version: loaded.version,
      isBundled: false,
      devMode: true,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    // Deactivate previous dev backend if reloading
    if (this.#devOverrides.has(devId)) {
      await this.#deactivateBackend(devId);
      this.#backendModuleCache.delete(devId);
    }

    // Store in-memory only — registry.json is untouched
    this.#devOverrides.set(devId, entry);

    await this.#activateBackend(entry).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      entry.status = "blocked";
      entry.lastError = message;
      this.#devOverrides.set(devId, entry);
    });

    return entry;
  }

  async setEnabled(
    instrumentId: string,
    enabled: boolean
  ): Promise<InstrumentRegistryEntry> {
    const entry = this.#requireEntry(instrumentId);
    const nextStatus: InstrumentRegistryEntry["status"] = enabled
      ? (entry.lastError ? "blocked" : "active")
      : "disabled";
    const updated = await this.#registry.upsert({
      ...entry,
      enabled,
      status: nextStatus,
    });

    if (!enabled) {
      await this.#deactivateBackend(instrumentId);
      this.#backendModuleCache.delete(instrumentId);
      return this.#requireEntry(instrumentId);
    }

    if (updated.status === "blocked") {
      return updated;
    }

    await this.#activateBackend(updated).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      void this.markBlocked(instrumentId, message);
    });
    return this.#requireEntry(instrumentId);
  }

  async remove(
    instrumentId: string,
    opts?: { deleteData?: boolean }
  ): Promise<{ removed: boolean; dataDeleted: boolean }> {
    const entry = this.#requireEntry(instrumentId);
    if (entry.isBundled) {
      throw new Error(`Bundled instrument '${instrumentId}' cannot be uninstalled`);
    }

    await this.#deactivateBackend(instrumentId);
    this.#backendModuleCache.delete(instrumentId);

    // Dev overrides live in-memory only — just delete from the map
    if (this.#devOverrides.has(instrumentId)) {
      this.#devOverrides.delete(instrumentId);
      return { removed: true, dataDeleted: false };
    }

    const removed = await this.#registry.remove(instrumentId);

    let dataDeleted = false;
    if (removed && opts?.deleteData) {
      await this.#storage.deleteInstrumentData(instrumentId);
      dataDeleted = true;
    }

    return { removed, dataDeleted };
  }

  async markBlocked(instrumentId: string, error: string): Promise<void> {
    const entry = this.#requireEntry(instrumentId);
    await this.#deactivateBackend(instrumentId);
    await this.#registry.upsert({
      ...entry,
      status: "blocked",
      enabled: true,
      lastError: String(error || "Instrument activation failed"),
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

  async callAction(
    instrumentId: string,
    action: string,
    input?: unknown
  ): Promise<unknown> {
    const entry = this.#requireUsableEntry(instrumentId);
    const module = await this.#loadBackendModule(entry);
    if (!module.activated && !module.suspended) {
      await this.#activateBackend(entry);
    }
    if (!module.definition) {
      throw new Error(`Instrument '${entry.id}' does not define a backend module`);
    }

    const actionName = String(action ?? "").trim();
    if (!actionName) {
      throw new Error("Instrument action is required");
    }
    const selected = module.definition.actions[actionName];
    if (!selected) {
      throw new Error(`Instrument '${entry.id}' does not implement action '${actionName}'`);
    }

    if (selected.input) {
      const error = validateSchema(input, selected.input, "input");
      if (error) {
        throw new Error(`Invalid action input for '${actionName}': ${error}`);
      }
    }

    const ctx = this.#buildContext(entry);
    const result = await selected.handler(ctx, input as never);
    if (selected.output) {
      const error = validateSchema(result, selected.output, "output");
      if (error) {
        throw new Error(`Invalid action output for '${actionName}': ${error}`);
      }
    }
    return result;
  }

  async getFrontendSource(
    instrumentId: string
  ): Promise<{ code: string; sourcePath: string }> {
    const entry = this.#requireUsableEntry(instrumentId);
    const sourcePath = resolve(entry.installPath, entry.entrypoint);
    const code = await readFile(sourcePath, "utf8");
    return { code, sourcePath };
  }

  async getSettingsSchema(instrumentId: string): Promise<InstrumentSettingField[]> {
    const entry = this.#requireUsableEntry(instrumentId);
    return entry.settings.slice();
  }

  async getSettingsValues(instrumentId: string): Promise<Record<string, unknown>> {
    const entry = this.#requireUsableEntry(instrumentId);
    return this.#readSettingsValues(entry);
  }

  async setSettingValue(
    instrumentId: string,
    key: string,
    value: unknown
  ): Promise<Record<string, unknown>> {
    const entry = this.#requireUsableEntry(instrumentId);
    const field = entry.settings.find((item) => item.key === key) ?? null;
    if (!field) {
      throw new Error(`Unknown setting '${key}' for instrument '${entry.id}'`);
    }

    const normalized = normalizeSettingValue(field, value);
    if (field.secret) {
      if (normalized == null || normalized === "") {
        await this.#storage.deleteSettingSecret(entry.id, field.key);
      } else {
        await this.#storage.setSettingSecret(entry.id, field.key, String(normalized));
      }
    } else if (normalized == null) {
      await this.#storage.deleteSettingProperty(entry.id, field.key);
    } else {
      await this.#storage.setSettingProperty(entry.id, field.key, normalized);
    }

    return this.#readSettingsValues(entry);
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

  emitHostEvent<E extends keyof HostEventMap>(event: E, payload: HostEventMap[E]): void {
    for (const [instrumentId, byEvent] of this.#backendSubscriptions) {
      const handlers = byEvent.get(event);
      if (!handlers || handlers.size === 0) continue;
      const entry = this.#registry.get(instrumentId);
      if (!entry || !entry.enabled || entry.status === "disabled" || entry.status === "blocked") continue;
      for (const handler of handlers) {
        Promise.resolve()
          .then(() => handler(payload))
          .catch((err) => {
            console.warn(
              `Instrument '${instrumentId}' host event handler failed (${String(event)}):`,
              err
            );
          });
      }
    }
  }

  #buildContext(entry: InstrumentRegistryEntry): InstrumentBackendContext {
    const subscribe = <E extends keyof HostEventMap>(
      event: E,
      handler: (payload: HostEventMap[E]) => void | Promise<void>
    ): (() => void) => {
      this.#requireEventPermission(entry, event);
      const byEvent = this.#backendSubscriptions.get(entry.id) ?? new Map();
      const handlers = byEvent.get(event) ?? new Set<BackendEventHandler>();
      const wrapped = handler as BackendEventHandler;
      handlers.add(wrapped);
      byEvent.set(event, handlers);
      this.#backendSubscriptions.set(entry.id, byEvent);
      console.log(`[subscribe] ${entry.id} → ${String(event)} (total handlers: ${handlers.size}, total instruments: ${this.#backendSubscriptions.size})`);
      return () => {
        const currentByEvent = this.#backendSubscriptions.get(entry.id);
        if (!currentByEvent) return;
        const currentHandlers = currentByEvent.get(event);
        if (!currentHandlers) return;
        currentHandlers.delete(wrapped);
        if (currentHandlers.size === 0) {
          currentByEvent.delete(event);
        }
        if (currentByEvent.size === 0) {
          this.#backendSubscriptions.delete(entry.id);
        }
      };
    };

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
      logger: {
        error: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "error", message, detail: args.length > 0 ? args : undefined });
        },
        warn: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "warn", message, detail: args.length > 0 ? args : undefined });
        },
        info: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "info", message, detail: args.length > 0 ? args : undefined });
        },
        debug: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "debug", message, detail: args.length > 0 ? args : undefined });
        },
      },
      host: {
        storage: {
          getProperty: async (key) => this.getProperty(entry.id, key),
          setProperty: async (key, value) => this.setProperty(entry.id, key, value),
          deleteProperty: async (key) => this.deleteProperty(entry.id, key),
          readFile: async (path, encoding) => this.readFile(entry.id, path, encoding),
          writeFile: async (path, content, encoding) =>
            this.writeFile(entry.id, path, content, encoding),
          deleteFile: async (path) => this.deleteFile(entry.id, path),
          listFiles: async (dir) => this.listFiles(entry.id, dir),
          sqlQuery: async (sql, params, db) => this.sqlQuery(entry.id, sql, params, db),
          sqlExecute: async (sql, params, db) => this.sqlExecute(entry.id, sql, params, db),
        },
        sessions: {
          start: async (params) => {
            requirePermission(entry, "sessions");
            return this.#hostApi.sessions.start(params);
          },
          sendFollowUp: async (params) => {
            requirePermission(entry, "sessions");
            await this.#hostApi.sessions.sendFollowUp(params);
          },
          kill: async (sessionId) => {
            requirePermission(entry, "sessions");
            await this.#hostApi.sessions.kill(sessionId);
          },
          list: async () => {
            requirePermission(entry, "sessions");
            return this.#hostApi.sessions.list();
          },
          query: async (params) => {
            requirePermission(entry, "sessions");
            if (!this.#hostApi.sessions.query) {
              throw new Error("sessions.query is not available");
            }
            return this.#hostApi.sessions.query(params);
          },
          focus: async () => {
            // Backend has no UI surface to focus sessions.
          },
        },
        connectors: {
          listStageConnectors: async (stagePath) => {
            requirePermission(entry, "connectors.read");
            return this.#hostApi.connectors.listStageConnectors(stagePath);
          },
          getCredential: async (stagePath, provider) => {
            requirePermission(entry, "connectors.credentials.read");
            return this.#hostApi.connectors.getCredential(stagePath, provider);
          },
          isAuthorized: async (stagePath, provider) => {
            requirePermission(entry, "connectors.read");
            const connectors = await this.#hostApi.connectors.listStageConnectors(stagePath);
            return connectors.some((c) => c.provider === provider && c.status === "connected");
          },
          connect: async (stagePath, provider) => {
            requirePermission(entry, "connectors.connect");
            return this.#hostApi.connectors.connect(stagePath, provider) as any;
          },
          disconnect: async (stagePath, provider) => {
            requirePermission(entry, "connectors.connect");
            await this.#hostApi.connectors.disconnect(stagePath, provider);
          },
        },
        stages: {
          list: async () => {
            requirePermission(entry, "stages.read");
            return this.#hostApi.stages.list();
          },
          active: async () => {
            requirePermission(entry, "stages.read");
            return this.#hostApi.stages.active();
          },
        },
        events: {
          subscribe,
        },
        settings: {
          getSchema: async () => this.getSettingsSchema(entry.id),
          getValues: async () => this.getSettingsValues(entry.id),
          setValue: async (key, value) => this.setSettingValue(entry.id, key, value),
        },
      },
    };
  }

  async suspendBackend(instrumentId: string): Promise<void> {
    const entry = this.#registry.get(instrumentId);
    if (!entry || !entry.enabled || entry.status !== "active") return;

    const module = this.#backendModuleCache.get(instrumentId);
    if (!module || module.suspended) return;
    if (!module.activated) return;

    if (module.definition?.onStop) {
      try {
        await module.definition.onStop();
      } catch (err) {
        console.warn(`Failed to suspend backend '${instrumentId}':`, err);
      }
    }

    this.#backendSubscriptions.delete(instrumentId);
    module.activated = false;
    module.suspended = true;

    this.#startBackgroundScheduler(instrumentId);
  }

  async resumeBackend(instrumentId: string): Promise<void> {
    const entry = this.#registry.get(instrumentId);
    if (!entry || !entry.enabled || entry.status !== "active") return;

    this.#stopBackgroundScheduler(instrumentId);

    const module = this.#backendModuleCache.get(instrumentId);
    if (!module || !module.suspended) return;

    if (module.definition?.onStart) {
      const ctx = this.#buildContext(entry);
      await module.definition.onStart(ctx);
    }
    module.activated = true;
    module.suspended = false;
  }

  #startBackgroundScheduler(instrumentId: string): void {
    if (this.#backgroundSchedulers.has(instrumentId)) return;

    const entry = this.#registry.get(instrumentId);
    if (!entry?.backgroundRefresh?.enabled) return;

    const module = this.#backendModuleCache.get(instrumentId);
    if (!module?.definition?.onBackgroundRefresh) return;

    const intervalMs = Math.max(10_000, (entry.backgroundRefresh.intervalSeconds ?? 30) * 1000);
    const hardTimeoutMs = Math.max(30_000, intervalMs * 2);

    const state: BackgroundSchedulerState = {
      timer: null,
      running: false,
      abortController: null,
    };

    state.timer = setInterval(async () => {
      if (state.running) return;

      const currentEntry = this.#registry.get(instrumentId);
      if (!currentEntry?.enabled || currentEntry.status !== "active") {
        this.#stopBackgroundScheduler(instrumentId);
        return;
      }

      const currentModule = this.#backendModuleCache.get(instrumentId);
      if (!currentModule?.definition?.onBackgroundRefresh) {
        this.#stopBackgroundScheduler(instrumentId);
        return;
      }

      state.running = true;
      const abortController = new AbortController();
      state.abortController = abortController;

      const timeoutId = setTimeout(() => {
        abortController.abort();
        console.warn(`[backgroundRefresh] ${instrumentId} tick exceeded ${hardTimeoutMs}ms, aborting`);
      }, hardTimeoutMs);

      try {
        const ctx = this.#buildBackgroundRefreshContext(currentEntry);
        await Promise.race([
          currentModule.definition.onBackgroundRefresh(ctx),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener("abort", () => {
              reject(new Error(`Background refresh timeout for '${instrumentId}'`));
            });
          }),
        ]);
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.warn(`[backgroundRefresh] ${instrumentId} tick failed:`, err);
        }
      } finally {
        clearTimeout(timeoutId);
        state.running = false;
        state.abortController = null;
      }
    }, intervalMs);

    this.#backgroundSchedulers.set(instrumentId, state);
  }

  #stopBackgroundScheduler(instrumentId: string): void {
    const state = this.#backgroundSchedulers.get(instrumentId);
    if (!state) return;

    if (state.timer) clearInterval(state.timer);
    if (state.abortController) state.abortController.abort();

    this.#backgroundSchedulers.delete(instrumentId);
  }

  #stopAllBackgroundSchedulers(): void {
    for (const instrumentId of this.#backgroundSchedulers.keys()) {
      this.#stopBackgroundScheduler(instrumentId);
    }
  }

  #buildBackgroundRefreshContext(entry: InstrumentRegistryEntry): InstrumentBackgroundRefreshContext {
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
      logger: {
        error: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "error", message, detail: args.length > 0 ? args : undefined });
        },
        warn: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "warn", message, detail: args.length > 0 ? args : undefined });
        },
        info: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "info", message, detail: args.length > 0 ? args : undefined });
        },
        debug: (message: string, ...args: unknown[]) => {
          this.#onLog?.({ instrumentId: entry.id, level: "debug", message, detail: args.length > 0 ? args : undefined });
        },
      },
      host: {
        storage: {
          getProperty: async (key) => this.getProperty(entry.id, key),
          setProperty: async (key, value) => this.setProperty(entry.id, key, value),
          deleteProperty: async (key) => this.deleteProperty(entry.id, key),
          readFile: async (path, encoding) => this.readFile(entry.id, path, encoding),
          writeFile: async (path, content, encoding) =>
            this.writeFile(entry.id, path, content, encoding),
          deleteFile: async (path) => this.deleteFile(entry.id, path),
          listFiles: async (dir) => this.listFiles(entry.id, dir),
          sqlQuery: async (sql, params, db) => this.sqlQuery(entry.id, sql, params, db),
          sqlExecute: async (sql, params, db) => this.sqlExecute(entry.id, sql, params, db),
        },
        settings: {
          getSchema: async () => this.getSettingsSchema(entry.id),
          getValues: async () => this.getSettingsValues(entry.id),
          setValue: async (key, value) => this.setSettingValue(entry.id, key, value),
        },
      },
    };
  }

  #requireEntry(instrumentId: string): InstrumentRegistryEntry {
    const entry = this.get(instrumentId);
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
        ...(loaded.manifest.description ? { description: loaded.manifest.description } : {}),
        group: loaded.manifest.group,
        ...(loaded.manifest.category ? { category: loaded.manifest.category } : {}),
        source: "bundled",
        installPath: loaded.installPath,
        manifestPath: loaded.manifestPath,
        runtime: loaded.manifest.runtime ?? "vanilla",
        entrypoint: loaded.manifest.entrypoint,
        ...(loaded.manifest.backendEntrypoint
          ? { backendEntrypoint: loaded.manifest.backendEntrypoint }
          : {}),
        hostApiVersion: loaded.manifest.hostApiVersion,
        panels: loaded.manifest.panels,
        permissions: loaded.manifest.permissions,
        settings: loaded.manifest.settings ?? [],
        launcher: loaded.manifest.launcher,
        ...(loaded.manifest.backgroundRefresh ? { backgroundRefresh: loaded.manifest.backgroundRefresh } : {}),
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

  async #activateBackend(entry: InstrumentRegistryEntry): Promise<void> {
    if (!entry.enabled || entry.status === "disabled" || entry.status === "blocked") return;
    const module = await this.#loadBackendModule(entry);
    if (module.activated) return;
    if (!module.definition) {
      module.activated = true;
      return;
    }
    if (module.definition.onStart) {
      const ctx = this.#buildContext(entry);
      await module.definition.onStart(ctx);
    }
    module.activated = true;
  }

  async #deactivateBackend(instrumentId: string): Promise<void> {
    this.#stopBackgroundScheduler(instrumentId);
    const module = this.#backendModuleCache.get(instrumentId);
    if (module?.activated && module.definition?.onStop) {
      try {
        await module.definition.onStop();
      } catch (err) {
        console.warn(`Failed to deactivate backend instrument '${instrumentId}':`, err);
      }
    }
    if (module) {
      module.activated = false;
      module.suspended = false;
    }
    this.#backendSubscriptions.delete(instrumentId);
  }

  async #loadBackendModule(
    entry: InstrumentRegistryEntry
  ): Promise<LoadedBackendModule> {
    const cached = this.#backendModuleCache.get(entry.id);
    const backendPath = entry.backendEntrypoint
      ? resolve(entry.installPath, entry.backendEntrypoint)
      : null;
    if (cached && cached.absoluteEntrypoint === backendPath) {
      return cached;
    }

    if (!backendPath) {
      const loaded: LoadedBackendModule = {
        definition: null,
        absoluteEntrypoint: null,
        activated: false,
        suspended: false,
      };
      this.#backendModuleCache.set(entry.id, loaded);
      return loaded;
    }

    const href = pathToFileURL(backendPath).href;
    const imported = await import(`${href}?t=${Date.now()}`);
    const moduleLike = (imported.default ?? imported) as Partial<InstrumentBackendDefinition>;
    if (!moduleLike || moduleLike.kind !== "tango.instrument.backend.v2") {
      throw new Error(
        `Instrument backend module '${entry.id}' must export kind='tango.instrument.backend.v2'`
      );
    }
    if (!moduleLike.actions || typeof moduleLike.actions !== "object") {
      throw new Error(`Instrument backend module '${entry.id}' must export actions`);
    }

    const definition: InstrumentBackendDefinition = {
      kind: "tango.instrument.backend.v2",
      actions: moduleLike.actions,
      onStart: moduleLike.onStart,
      onStop: moduleLike.onStop,
      onBackgroundRefresh: moduleLike.onBackgroundRefresh,
    };

    const loaded: LoadedBackendModule = {
      definition,
      absoluteEntrypoint: backendPath,
      activated: false,
      suspended: false,
    };

    this.#backendModuleCache.set(entry.id, loaded);
    return loaded;
  }

  #requireEventPermission<E extends keyof HostEventMap>(
    entry: InstrumentRegistryEntry,
    event: E
  ): void {
    const permission = EVENT_PERMISSION_MAP[event];
    requirePermission(entry, permission);
  }

  async #readSettingsValues(entry: InstrumentRegistryEntry): Promise<Record<string, unknown>> {
    const values: Record<string, unknown> = {};
    for (const field of entry.settings) {
      if (field.secret) {
        const secret = await this.#storage.getSettingSecret(entry.id, field.key);
        values[field.key] = secret ?? ("default" in field ? field.default : null);
        continue;
      }
      const prop = await this.#storage.getSettingProperty(entry.id, field.key);
      if (prop == null) {
        values[field.key] = "default" in field ? field.default : null;
      } else {
        values[field.key] = prop;
      }
    }
    return values;
  }
}

function validateSchema(
  value: unknown,
  schema: ActionSchema,
  path: string
): string | null {
  if (schema.type === "any") return null;
  if (schema.type === "null") {
    return value == null ? null : `${path} must be null`;
  }
  if (schema.type === "string") {
    return typeof value === "string" ? null : `${path} must be string`;
  }
  if (schema.type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? null
      : `${path} must be number`;
  }
  if (schema.type === "boolean") {
    return typeof value === "boolean" ? null : `${path} must be boolean`;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return `${path} must be array`;
    if (!schema.items) return null;
    for (let i = 0; i < value.length; i += 1) {
      const error = validateSchema(value[i], schema.items, `${path}[${i}]`);
      if (error) return error;
    }
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `${path} must be object`;
  }

  const obj = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      return `${path}.${key} is required`;
    }
  }

  for (const [key, val] of Object.entries(obj)) {
    const subSchema = properties[key];
    if (!subSchema) {
      if (schema.additionalProperties === false) {
        return `${path}.${key} is not allowed`;
      }
      continue;
    }
    const error = validateSchema(val, subSchema, `${path}.${key}`);
    if (error) return error;
  }
  return null;
}

function normalizeSettingValue(
  field: InstrumentSettingField,
  value: unknown
): unknown {
  if (value == null || value === "") {
    if (field.required) {
      throw new Error(`Setting '${field.key}' is required`);
    }
    return null;
  }

  if (field.type === "string") {
    return String(value);
  }
  if (field.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`Setting '${field.key}' must be a number`);
    }
    if (typeof field.min === "number" && n < field.min) {
      throw new Error(`Setting '${field.key}' must be >= ${field.min}`);
    }
    if (typeof field.max === "number" && n > field.max) {
      throw new Error(`Setting '${field.key}' must be <= ${field.max}`);
    }
    return n;
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    throw new Error(`Setting '${field.key}' must be a boolean`);
  }

  const selected = String(value);
  const exists = field.options.some((option) => option.value === selected);
  if (!exists) {
    throw new Error(`Invalid value for setting '${field.key}'`);
  }
  return selected;
}
