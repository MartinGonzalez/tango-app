import {
  ensureInstrumentUI as ensureUIDOMStyles,
  button as createUIButton,
  iconButton as createUIIconButton,
  dropdown as createUIDropdown,
  segmentedControl as createUISegmentedControl,
  tabs as createUITabs,
} from "@tango/instrument-ui";

export { Icon } from "@tango/instrument-ui";

export const UIDOM = {
  ensureStyles: ensureUIDOMStyles,
  UIButton: createUIButton,
  UIIconButton: createUIIconButton,
  UIDropdown: createUIDropdown,
  UISegmentedControl: createUISegmentedControl,
  UITabs: createUITabs,
} as const;

export type {
  UIButtonSize,
  UIButtonVariant,
  UIIconButtonSize,
  UIIconButtonVariant,
  UIIconName,
  UIDOMButtonOptions,
  UIDOMDropdownOptions,
  UIDOMIconButtonOptions,
  UIDOMOption,
  UIDOMRootOptions,
  UIDOMSegmentedControlOptions,
  UIDOMTabDefinition,
  UIDOMTabsOptions,
} from "@tango/instrument-ui";
