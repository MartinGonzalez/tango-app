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

/* ── SVG instrument icons (mirrors tango-api icon system) ── */

const SVG_NS = "http://www.w3.org/2000/svg";

type IconPrimitive =
  | { tag: "path"; d: string }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number };

const ICON_PRIMITIVES: Record<string, IconPrimitive[]> = {
  branch: [
    { tag: "line", x1: 6, y1: 4, x2: 6, y2: 20 },
    { tag: "line", x1: 6, y1: 12, x2: 18, y2: 12 },
    { tag: "circle", cx: 6, cy: 4, r: 2.2 },
    { tag: "circle", cx: 18, cy: 12, r: 2.2 },
    { tag: "circle", cx: 6, cy: 20, r: 2.2 },
  ],
  play: [
    { tag: "path", d: "M9 6 L19 12 L9 18 Z" },
  ],
  post: [
    { tag: "path", d: "M4 6 H20 V18 H4 Z" },
    { tag: "line", x1: 7, y1: 10, x2: 17, y2: 10 },
    { tag: "line", x1: 7, y1: 14, x2: 15, y2: 14 },
  ],
  ai: [
    { tag: "path", d: "M12 3.5 L14.2 9.2 L20 12 L14.2 14.8 L12 20.5 L9.8 14.8 L4 12 L9.8 9.2 Z" },
  ],
  check: [
    { tag: "path", d: "M5 12.5 L10 17 L19 8" },
  ],
  pause: [
    { tag: "line", x1: 9, y1: 6, x2: 9, y2: 18 },
    { tag: "line", x1: 15, y1: 6, x2: 15, y2: 18 },
  ],
  "external-link": [
    { tag: "path", d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" },
    { tag: "line", x1: 15, y1: 3, x2: 21, y2: 3 },
    { tag: "line", x1: 21, y1: 3, x2: 21, y2: 9 },
    { tag: "line", x1: 10, y1: 14, x2: 21, y2: 3 },
  ],
  send: [
    { tag: "line", x1: 22, y1: 2, x2: 11, y2: 13 },
    { tag: "path", d: "M22 2 L15 22 L11 13 L2 9 Z" },
  ],
  pencil: [
    { tag: "path", d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" },
    { tag: "path", d: "m15 5 4 4" },
  ],
  puzzle: [
    { tag: "path", d: "M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.5 2.5 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877L2.294 13.296A2.404 2.404 0 0 1 1.588 11.592c0-.617.236-1.234.706-1.704L3.905 8.277c.238-.237.56-.341.877-.289c.493.074.84.504 1.02.968a2.5 2.5 0 1 0 3.237-3.237c-.464-.18-.894-.527-.967-1.02a1.026 1.026 0 0 1 .289-.877l1.61-1.611A2.404 2.404 0 0 1 11.676 1.505c.617 0 1.234.236 1.704.706l1.568 1.568c.23.229.556.338.878.289c.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" },
  ],
  list: [
    { tag: "line", x1: 8, y1: 6, x2: 21, y2: 6 },
    { tag: "line", x1: 8, y1: 12, x2: 21, y2: 12 },
    { tag: "line", x1: 8, y1: 18, x2: 21, y2: 18 },
    { tag: "circle", cx: 3, cy: 6, r: 1.2 },
    { tag: "circle", cx: 3, cy: 12, r: 1.2 },
    { tag: "circle", cx: 3, cy: 18, r: 1.2 },
  ],
  chat: [
    { tag: "path", d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  ],
  music: [
    { tag: "path", d: "M9 18V5l12-2v13" },
    { tag: "circle", cx: 6, cy: 18, r: 3 },
    { tag: "circle", cx: 18, cy: 16, r: 3 },
  ],
};

/**
 * Creates an SVG icon element matching the tango-api icon style.
 * Falls back to "puzzle" for unknown icon names.
 */
export function instrumentIcon(name: string, size = 18): HTMLElement {
  const primitives = ICON_PRIMITIVES[name] ?? ICON_PRIMITIVES.puzzle;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const p of primitives) {
    const node = document.createElementNS(SVG_NS, p.tag);
    if (p.tag === "path") {
      node.setAttribute("d", p.d);
    } else if (p.tag === "circle") {
      node.setAttribute("cx", String(p.cx));
      node.setAttribute("cy", String(p.cy));
      node.setAttribute("r", String(p.r));
    } else {
      node.setAttribute("x1", String(p.x1));
      node.setAttribute("y1", String(p.y1));
      node.setAttribute("x2", String(p.x2));
      node.setAttribute("y2", String(p.y2));
    }
    svg.appendChild(node);
  }

  const wrapper = h("span", {
    class: "instrument-icon",
    "aria-hidden": "true",
  });
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.appendChild(svg);
  return wrapper;
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

export function connectorsToolIcon(className = "sidebar-primary-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("link")]);
}

export function stageBranchIcon(className = "vcs-branch-icon"): HTMLElement {
  return h("span", {
    class: className,
    "aria-hidden": "true",
  }, [materialIcon("fork_left")]);
}

/**
 * Shared VCS branch label: icon + text in a single inline component.
 */
export function vcsBranchLabel(branch: string): HTMLElement {
  return h("span", { class: "vcs-branch" }, [
    stageBranchIcon(),
    h("span", { class: "vcs-branch-text" }, [branch]),
  ]);
}
