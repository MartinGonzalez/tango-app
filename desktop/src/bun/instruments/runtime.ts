import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ConnectorCredential,
  ConnectorProvider,
  InstrumentBackendContext,
  InstrumentBackendModule,
  InstrumentEvent,
  InstrumentRegistryEntry,
  SessionInfo,
  StageConnector,
  HostEventMap,
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
  activate?: InstrumentBackendModule["activate"];
  deactivate?: InstrumentBackendModule["deactivate"];
  invoke?: InstrumentBackendModule["invoke"];
  absoluteEntrypoint: string;
  activated: boolean;
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
  #invokeHandlers: Record<string, InvokeHandler>;
  #onEvent: ((event: InstrumentEvent) => void) | null;
  #hostApi: HostApi;
  #backendModuleCache = new Map<string, LoadedBackendModule>();
  #backendSubscriptions = new Map<string, Map<keyof HostEventMap, Set<BackendEventHandler>>>();

  constructor(opts?: {
    registry?: InstrumentRegistry;
    storage?: InstrumentStorage;
    bundledInstallPaths?: string[];
    invokeHandlers?: Record<string, InvokeHandler>;
    onEvent?: (event: InstrumentEvent) => void;
    hostApi?: HostApi;
  }) {
    this.#registry = opts?.registry ?? new InstrumentRegistry();
    this.#storage = opts?.storage ?? new InstrumentStorage();
    this.#bundledInstallPaths = (opts?.bundledInstallPaths ?? []).map((value) =>
      resolve(String(value))
    );
    this.#invokeHandlers = opts?.invokeHandlers ?? {};
    this.#onEvent = opts?.onEvent ?? null;
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
      launcher: loaded.manifest.launcher,
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
    if (!module.activated) {
      await this.#activateBackend(entry);
    }
    if (typeof module.invoke !== "function") {
      throw new Error(`Instrument '${entry.id}' backend does not implement invoke()`);
    }
    return module.invoke(ctx, method, params);
  }

  async getFrontendSource(
    instrumentId: string
  ): Promise<{ code: string; sourcePath: string }> {
    const entry = this.#requireUsableEntry(instrumentId);
    const sourcePath = resolve(entry.installPath, entry.entrypoint);
    const code = await readFile(sourcePath, "utf8");
    return { code, sourcePath };
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
      if (!entry || !entry.enabled || entry.status === "disabled" || entry.status === "blocked") {
        continue;
      }
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

    const startSession: InstrumentBackendContext["host"]["sessions"]["start"] = async (params) => {
      requirePermission(entry, "sessions");
      return this.#hostApi.sessions.start(params);
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
          start: startSession,
          spawn: startSession,
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
        launcher: loaded.manifest.launcher,
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
    if (!module.activate) {
      module.activated = true;
      return;
    }
    const ctx = this.#buildContext(entry);
    await module.activate(ctx);
    module.activated = true;
  }

  async #deactivateBackend(instrumentId: string): Promise<void> {
    const module = this.#backendModuleCache.get(instrumentId);
    if (module?.activated && module.deactivate) {
      try {
        await module.deactivate();
      } catch (err) {
        console.warn(`Failed to deactivate backend instrument '${instrumentId}':`, err);
      }
    }
    if (module) {
      module.activated = false;
    }
    this.#backendSubscriptions.delete(instrumentId);
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
    if (!moduleLike || (
      typeof moduleLike.invoke !== "function"
      && typeof moduleLike.activate !== "function"
      && typeof moduleLike.deactivate !== "function"
    )) {
      throw new Error(
        `Instrument backend module '${entry.id}' must export at least one of activate(), deactivate(), invoke()`
      );
    }

    const loaded: LoadedBackendModule = {
      invoke: moduleLike.invoke
        ? moduleLike.invoke.bind(moduleLike)
        : undefined,
      activate: moduleLike.activate
        ? moduleLike.activate.bind(moduleLike)
        : undefined,
      deactivate: moduleLike.deactivate
        ? moduleLike.deactivate.bind(moduleLike)
        : undefined,
      absoluteEntrypoint,
      activated: false,
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
}
