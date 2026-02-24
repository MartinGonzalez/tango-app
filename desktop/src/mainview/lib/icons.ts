import { h } from "./dom.ts";

const MENU_DOTS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>';
const TOOL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24V24H0z" fill="none"/><path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" /></svg>';
const TASKS_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3l8 -8"/><path d="M20 12v7a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h9"/><path d="M16 3h5v5"/></svg>';
const WORKSPACE_BRANCH_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M6 8l0 8" /><path d="M11 6h5a2 2 0 0 1 2 2v8" /><path d="M14 9l-3 -3l3 -3" /></svg>';

export function menuDotsIcon(className = "menu-dots-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
    innerHTML: MENU_DOTS_SVG,
  });
}

export function pluginToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
    innerHTML: TOOL_ICON_SVG,
  });
}

export function tasksToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
    innerHTML: TASKS_ICON_SVG,
  });
}

export function workspaceBranchIcon(className = "ws-branch-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
    innerHTML: WORKSPACE_BRANCH_ICON_SVG,
  });
}
