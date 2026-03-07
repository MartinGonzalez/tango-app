export type InstrumentPermission =
  | "storage.files"
  | "storage.db"
  | "storage.properties"
  | "sessions"
  | "connectors.read"
  | "connectors.credentials.read"
  | "connectors.connect"
  | "stages.read"
  | "stages.observe";

export type InstrumentRuntime = "react" | "vanilla";

export type InstrumentPanelConfig = {
  sidebar: boolean;
  first: boolean;
  second: boolean;
  right: boolean;
};

type InstrumentSettingFieldBase = {
  key: string;
  title: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
};

export type InstrumentSettingField =
  | (InstrumentSettingFieldBase & {
      type: "string";
      default?: string;
      placeholder?: string;
    })
  | (InstrumentSettingFieldBase & {
      type: "number";
      default?: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (InstrumentSettingFieldBase & {
      type: "boolean";
      default?: boolean;
    })
  | (InstrumentSettingFieldBase & {
      type: "select";
      default?: string;
      options: Array<{
        label: string;
        value: string;
      }>;
    });

export type BackgroundRefreshConfig = {
  enabled: boolean;
  intervalSeconds: number;
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
  runtime?: InstrumentRuntime;
  entrypoint: string;
  backendEntrypoint?: string;
  hostApiVersion: string;
  panels: InstrumentPanelConfig;
  permissions: InstrumentPermission[];
  settings?: InstrumentSettingField[];
  launcher?: InstrumentLauncherConfig;
  backgroundRefresh?: BackgroundRefreshConfig;
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
  runtime: InstrumentRuntime;
  entrypoint: string;
  backendEntrypoint?: string;
  hostApiVersion: string;
  panels: InstrumentPanelConfig;
  permissions: InstrumentPermission[];
  settings: InstrumentSettingField[];
  launcher?: InstrumentLauncherConfig;
  backgroundRefresh?: BackgroundRefreshConfig;
  enabled: boolean;
  status: InstrumentStatus;
  version: string;
  isBundled: boolean;
  devMode?: boolean;
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
