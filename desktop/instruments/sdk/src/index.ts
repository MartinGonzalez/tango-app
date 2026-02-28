import type {
  InstrumentBackendDefinition,
  TangoInstrumentDefinition,
} from "../../../src/shared/types/instrument-sdk.ts";

export function defineInstrument(definition: TangoInstrumentDefinition): TangoInstrumentDefinition {
  return definition;
}

export function defineBackend(
  definition: InstrumentBackendDefinition
): InstrumentBackendDefinition {
  return definition;
}

export type {
  ActionSchema,
  ConnectorsAPI,
  HostEventMap,
  HostEventsAPI,
  InstrumentBackendAction,
  InstrumentBackendContext,
  InstrumentBackendDefinition,
  InstrumentBackendHostAPI,
  InstrumentFrontendAPI,
  InstrumentSettingsAPI,
  SessionsAPI,
  ShortcutRegistration,
  StageAPI,
  StorageAPI,
  TangoInstrumentDefinition,
  TangoPanelComponent,
  TangoPanelRenderResult,
  TangoPanelSlot,
} from "../../../src/shared/types/instrument-sdk.ts";

export type {
  InstrumentEvent,
  InstrumentLauncherConfig,
  InstrumentManifest,
  InstrumentPanelConfig,
  InstrumentPermission,
  InstrumentRegistryEntry,
  InstrumentRuntime,
  InstrumentSettingField,
  InstrumentStatus,
} from "../../../src/shared/types/instruments.ts";
