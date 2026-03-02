import {
  UIDOM,
  type UIDOMButtonOptions,
  type UIDOMDropdownOptions,
  type UIDOMIconButtonOptions,
} from "tango-api/dom";

let stylesInjected = false;

export type UIButtonOptions = UIDOMButtonOptions;
export type UIIconButtonOptions = UIDOMIconButtonOptions;
export type UIDropdownOptions = UIDOMDropdownOptions;

export function ensureUIStyles(doc: Document = document): void {
  if (stylesInjected) return;
  UIDOM.ensureStyles(doc);
  stylesInjected = true;
}

export function UIButton(opts: UIButtonOptions): HTMLButtonElement {
  ensureUIStyles();
  return UIDOM.UIButton(opts);
}

export function UIIconButton(opts: UIIconButtonOptions): HTMLButtonElement {
  ensureUIStyles();
  return UIDOM.UIIconButton(opts);
}

export function UIDropdown(opts: UIDropdownOptions): HTMLElement {
  ensureUIStyles();
  return UIDOM.UIDropdown(opts);
}
