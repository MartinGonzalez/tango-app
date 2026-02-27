import type {
  InstrumentFrontendModule,
  InstrumentRegistryEntry,
} from "../../shared/types.ts";

export type LoadInstrumentFrontendSource = (
  instrumentId: string
) => Promise<{ code: string; sourcePath: string }>;

export async function loadInstrumentFrontend(
  entry: InstrumentRegistryEntry,
  loadSource?: LoadInstrumentFrontendSource
): Promise<InstrumentFrontendModule> {
  // Tasks pilot continues to be mounted by host integration in mainview.
  if (entry.id === "tasks") {
    const mod = await import("../components/tasks-view.ts");
    return {
      activate: () => {
        void mod;
      },
      deactivate: () => {},
    };
  }

  const imported = await importInstrumentFrontendModule(entry, loadSource);
  const moduleLike = (imported.default ?? imported) as Partial<InstrumentFrontendModule>;
  if (!moduleLike || typeof moduleLike.activate !== "function") {
    throw new Error(
      `Instrument frontend module '${entry.id}' must export activate(ctx)`
    );
  }
  return {
    activate: moduleLike.activate.bind(moduleLike),
    deactivate: moduleLike.deactivate
      ? moduleLike.deactivate.bind(moduleLike)
      : undefined,
  };
}

async function importInstrumentFrontendModule(
  entry: InstrumentRegistryEntry,
  loadSource?: LoadInstrumentFrontendSource
): Promise<Record<string, unknown>> {
  if (loadSource) {
    const { code, sourcePath } = await loadSource(entry.id);
    const href = createBlobModuleHref(code, sourcePath);
    try {
      return await import(href);
    } finally {
      URL.revokeObjectURL(href);
    }
  }

  const absoluteEntrypoint = resolveInstrumentEntrypoint(entry.installPath, entry.entrypoint);
  const href = `${toFileImportHref(absoluteEntrypoint)}?t=${Date.now()}`;
  return import(href);
}

function resolveInstrumentEntrypoint(installPath: string, entrypoint: string): string {
  const base = String(installPath ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const relative = String(entrypoint ?? "").replace(/\\/g, "/").replace(/^\.?\//, "");
  return `${base}/${relative}`;
}

function toFileImportHref(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const withPrefix = normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
  return encodeURI(withPrefix);
}

function createBlobModuleHref(code: string, sourcePath: string): string {
  const footer = sourcePath ? `\n//# sourceURL=${encodeURI(sourcePath)}\n` : "\n";
  const blob = new Blob([`${code}${footer}`], { type: "text/javascript" });
  return URL.createObjectURL(blob);
}
