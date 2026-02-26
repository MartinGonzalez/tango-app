import { h } from "./dom.ts";

/**
 * Creates a Material Symbols Outlined icon element.
 */
function materialIcon(name: string, className?: string): HTMLElement {
  const span = h("span", {
    class: className
      ? `${className} material-symbols-outlined`
      : "material-symbols-outlined",
    "aria-hidden": "true",
  }, [name]);
  return span;
}

export function menuDotsIcon(className = "menu-dots-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("more_vert")]);
}

export function pluginToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("extension")]);
}

export function tasksToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("task_alt")]);
}

export function pullRequestsToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("fork_right")]);
}

export function connectorsToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("link")]);
}

export function workspaceBranchIcon(className = "ws-branch-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("fork_left")]);
}
