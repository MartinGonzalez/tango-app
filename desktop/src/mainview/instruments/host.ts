import type {
  InstrumentContext,
  InstrumentRegistryEntry,
  InstrumentFrontendModule,
} from "../../shared/types.ts";
import { loadInstrumentFrontend } from "./instrument-loader.ts";

export class InstrumentHost {
  #activeId: string | null = null;
  #activeModule: InstrumentFrontendModule | null = null;
  #entries: InstrumentRegistryEntry[] = [];
  #ctxFactory: (entry: InstrumentRegistryEntry) => InstrumentContext;

  constructor(opts: {
    contextFactory: (entry: InstrumentRegistryEntry) => InstrumentContext;
  }) {
    this.#ctxFactory = opts.contextFactory;
  }

  setEntries(entries: InstrumentRegistryEntry[]): void {
    this.#entries = entries.slice();
  }

  listEntries(): InstrumentRegistryEntry[] {
    return this.#entries.slice();
  }

  getActiveId(): string | null {
    return this.#activeId;
  }

  async activate(instrumentId: string): Promise<void> {
    const entry = this.#entries.find((item) => item.id === instrumentId) ?? null;
    if (!entry) {
      throw new Error(`Instrument '${instrumentId}' is not available`);
    }
    if (!entry.enabled) {
      throw new Error(`Instrument '${instrumentId}' is disabled`);
    }
    if (entry.status === "blocked") {
      throw new Error(entry.lastError || `Instrument '${instrumentId}' is blocked`);
    }

    await this.deactivate();

    const module = await loadInstrumentFrontend(entry);
    const ctx = this.#ctxFactory(entry);
    await module.activate(ctx);
    this.#activeId = entry.id;
    this.#activeModule = module;
  }

  async deactivate(): Promise<void> {
    if (this.#activeModule?.deactivate) {
      await this.#activeModule.deactivate();
    }
    this.#activeModule = null;
    this.#activeId = null;
  }
}
