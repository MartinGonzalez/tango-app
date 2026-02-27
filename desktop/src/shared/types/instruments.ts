export type InstrumentPermission =
  | "storage.files"
  | "storage.db"
  | "storage.properties"
  | "sessions"
  | "connectors.read"
  | "connectors.connect"
  | "stages.read"
  | "stages.observe";

export type InstrumentPanelConfig = {
  sidebar: boolean;
  first: boolean;
  second: boolean;
  right: boolean;
};

export type InstrumentLauncherConfig = {
  sidebarShortcut?: {
    enabled: boolean;
    label?: string;
    icon?: string;
    order?: number;
  };
};

export type InstrumentManifest = {
  id: string;
  name: string;
  group: string;
  entrypoint: string;
  backendEntrypoint?: string;
  hostApiVersion: string;
  panels: InstrumentPanelConfig;
  permissions: InstrumentPermission[];
  launcher?: InstrumentLauncherConfig;
};

export type InstrumentStatus =
  | "active"
  | "disabled"
  | "error"
  | "blocked";

export type InstrumentInstallSource = "bundled" | "local";

export type InstrumentRegistryEntry = {
  id: string;
  name: string;
  group: string;
  source: InstrumentInstallSource;
  installPath: string;
  manifestPath: string;
  entrypoint: string;
  backendEntrypoint?: string;
  hostApiVersion: string;
  panels: InstrumentPanelConfig;
  permissions: InstrumentPermission[];
  launcher?: InstrumentLauncherConfig;
  enabled: boolean;
  status: InstrumentStatus;
  version: string;
  isBundled: boolean;
  lastError: string | null;
  updatedAt: string;
};

export type InstrumentRegistryFile = {
  version: 1;
  entries: InstrumentRegistryEntry[];
};

export type InstrumentEvent = {
  instrumentId: string;
  event: string;
  payload?: unknown;
};
