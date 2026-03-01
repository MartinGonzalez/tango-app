// @tango/api — unified frontend surface
// Re-exports from SDK core types, SDK React hooks, and UI React components.

// SDK core types
export type {
  ActionSchema,
  ConnectorsAPI,
  HostEventMap,
  HostEventsAPI,
  InstrumentFrontendAPI,
  InstrumentSettingsAPI,
  SessionsAPI,
  SessionStartParams,
  ShortcutRegistration,
  StageAPI,
  StorageAPI,
  TangoInstrumentDefinition,
  TangoPanelComponent,
  TangoPanelRenderResult,
  TangoPanelSlot,
} from "@tango/instrument-sdk";

// SDK React hooks & helpers
export {
  defineReactInstrument,
  reactPanel,
  InstrumentApiProvider,
  useInstrumentApi,
  useHostEvent,
  usePanelVisibility,
  useInstrumentAction,
  useInstrumentSettings,
  useMemoAction,
  useHostApiMemo,
} from "@tango/instrument-sdk/react";

// UI React components
export {
  useInstrumentUIStyles,
  Icon,
  UIRoot,
  UIPanelHeader,
  UISection,
  UICard,
  UIIcon,
  UIIconButton,
  UIButton,
  UIInput,
  UITextarea,
  UISelect,
  UIDropdown,
  UIBadge,
  UIEmptyState,
  UIList,
  UIListItem,
  UIToggle,
  UICheckbox,
  UIRadioGroup,
  UISegmentedControl,
  UITabs,
  UIColorToken,
  UIStatusTone,
  UISelectionList,
  UIGroup,
  UIGroupList,
  UIGroupEmpty,
  UIGroupItem,
} from "@tango/instrument-ui/react";

// UI React types
export type {
  UIGroupItemMeta,
  UIIconButtonSize,
  UIIconButtonVariant,
  UIIconName,
  UIGroupSubtitle,
  UIGroupTitle,
} from "@tango/instrument-ui/react";
