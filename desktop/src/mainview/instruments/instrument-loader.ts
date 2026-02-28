import type {
  InstrumentRegistryEntry,
  TangoInstrumentDefinition,
} from "../../shared/types.ts";

export type LoadInstrumentFrontendSource = (
  instrumentId: string
) => Promise<{ code: string; sourcePath: string }>;

export async function loadInstrumentDefinition(
  entry: InstrumentRegistryEntry,
  loadSource?: LoadInstrumentFrontendSource
): Promise<TangoInstrumentDefinition> {
  const imported = await importInstrumentFrontendModule(entry, loadSource);
  const moduleLike = (imported.default ?? imported) as Partial<TangoInstrumentDefinition>;
  if (!moduleLike || moduleLike.kind !== "tango.instrument.v2" || !moduleLike.panels) {
    throw new Error(
      `Instrument frontend module '${entry.id}' must export default defineInstrument(...) with kind='tango.instrument.v2'`
    );
  }
  return {
    kind: "tango.instrument.v2",
    panels: moduleLike.panels,
    defaults: moduleLike.defaults,
    lifecycle: moduleLike.lifecycle,
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
