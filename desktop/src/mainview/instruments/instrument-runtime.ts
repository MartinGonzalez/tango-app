import type { InstrumentRegistryEntry } from "../../shared/types.ts";

export type InstrumentRpcClient = {
  request: {
    listInstruments: (params: {}) => Promise<InstrumentRegistryEntry[]>;
    installInstrumentFromPath: (params: { path: string }) => Promise<InstrumentRegistryEntry>;
    setInstrumentEnabled: (params: {
      instrumentId: string;
      enabled: boolean;
    }) => Promise<InstrumentRegistryEntry>;
    removeInstrument: (params: {
      instrumentId: string;
      deleteData?: boolean;
    }) => Promise<{ removed: boolean; dataDeleted: boolean }>;
  };
};

export class InstrumentRuntimeClient {
  #rpc: InstrumentRpcClient;

  constructor(rpc: InstrumentRpcClient) {
    this.#rpc = rpc;
  }

  async listInstruments(): Promise<InstrumentRegistryEntry[]> {
    return this.#rpc.request.listInstruments({});
  }

  async installFromPath(path: string): Promise<InstrumentRegistryEntry> {
    return this.#rpc.request.installInstrumentFromPath({ path });
  }

  async setEnabled(
    instrumentId: string,
    enabled: boolean
  ): Promise<InstrumentRegistryEntry> {
    return this.#rpc.request.setInstrumentEnabled({ instrumentId, enabled });
  }

  async remove(
    instrumentId: string,
    deleteData: boolean
  ): Promise<{ removed: boolean; dataDeleted: boolean }> {
    return this.#rpc.request.removeInstrument({ instrumentId, deleteData });
  }
}
