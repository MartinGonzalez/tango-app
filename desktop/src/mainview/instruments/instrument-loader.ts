import type {
  InstrumentFrontendModule,
  InstrumentRegistryEntry,
} from "../../shared/types.ts";

export async function loadInstrumentFrontend(
  entry: InstrumentRegistryEntry
): Promise<InstrumentFrontendModule> {
  // In v1 we support trusted bundled modules only. Local modules can still be listed and managed.
  if (entry.id === "tasks") {
    const mod = await import("../components/tasks-view.ts");
    // Placeholder no-op module; Tasks pilot UI is mounted by the host integration in index.ts.
    return {
      activate: () => {
        void mod;
      },
      deactivate: () => {},
    };
  }

  return {
    activate: () => {},
    deactivate: () => {},
  };
}
