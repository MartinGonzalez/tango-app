import type {
  InstrumentFrontendModule,
  InstrumentRegistryEntry,
} from "../../shared/types.ts";

export async function loadInstrumentFrontend(
  entry: InstrumentRegistryEntry
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

  const absoluteEntrypoint = resolveInstrumentEntrypoint(entry.installPath, entry.entrypoint);
  const href = `${toFileImportHref(absoluteEntrypoint)}?t=${Date.now()}`;
  const imported = await import(href);
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
