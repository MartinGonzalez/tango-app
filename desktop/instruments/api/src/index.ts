// @tango/api — unified frontend surface
// Re-exports from SDK core types, SDK React hooks, and UI React components.
export { UIDOM } from "./dom.ts";
export type {
  UIDOMButtonOptions,
  UIDOMDropdownOptions,
  UIDOMIconButtonOptions,
  UIDOMOption,
  UIDOMRootOptions,
  UIDOMSegmentedControlOptions,
  UIDOMTabDefinition,
  UIDOMTabsOptions,
} from "./dom.ts";

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
  UIAPI,
  TangoPanelComponent,
  TangoPanelRenderResult,
  TangoPanelSlot,
  UseSessionOptions,
  UseSessionReturn,
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
  useSession,
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
  UIMarkdownRenderer as UIMarkdownRendererBase,
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

// Convenience wrapper that auto-injects renderMarkdown from the instrument API
import React from "react";
import { useInstrumentApi } from "@tango/instrument-sdk/react";
import { UIMarkdownRenderer as _MarkdownRendererBase } from "@tango/instrument-ui/react";

export function UIMarkdownRenderer(props: {
  content: string;
  rawViewEnabled?: boolean;
  className?: string;
}): JSX.Element {
  const api = useInstrumentApi();
  return React.createElement(_MarkdownRendererBase, {
    ...props,
    renderMarkdown: api.ui.renderMarkdown,
  });
}
