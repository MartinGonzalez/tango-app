import { el, appendChildren } from "./dom.ts";
import { UI_STYLE_ID, UI_STYLES } from "./styles.ts";

export type UIButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type UIButtonSize = "sm" | "md";
export type UIGroupTitle = string | HTMLElement;
export type UIGroupSubtitle = string | HTMLElement;
export type UIGroupItemMeta = string | HTMLElement;

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

function normalizeContent(content?: HTMLElement | HTMLElement[]): HTMLElement[] {
  if (!content) return [];
  return Array.isArray(content) ? content : [content];
}

function normalizeNodeText(
  value: string | HTMLElement | undefined,
  className: string
): HTMLElement | null {
  if (!value) return null;
  if (typeof value === "string") {
    return el("span", { className, text: value });
  }
  value.classList.add(className);
  return value;
}

export function ensureInstrumentUI(doc: Document = document): void {
  if (!doc || !doc.head) return;
  if (doc.getElementById(UI_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = UI_STYLE_ID;
  style.textContent = UI_STYLES;
  doc.head.appendChild(style);
}

export function createRoot(opts: { className?: string } = {}): HTMLDivElement {
  ensureInstrumentUI();
  const className = opts.className
    ? `tui-root ${opts.className}`.trim()
    : "tui-root";
  return el("div", { className });
}

export function panelHeader(opts: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: HTMLElement[];
}): HTMLElement {
  const left = el("div", { className: "tui-header-left" });
  if (opts.onBack) {
    left.appendChild(button({
      label: "←",
      variant: "ghost",
      size: "sm",
      onClick: opts.onBack,
    }));
    left.querySelector("button")?.setAttribute("aria-label", "Back");
  }

  const titleWrap = el("div", {}, [
    el("div", { className: "tui-header-title", text: opts.title }),
    opts.subtitle
      ? el("div", { className: "tui-header-subtitle", text: opts.subtitle })
      : null,
  ]);
  left.appendChild(titleWrap);

  const right = el("div", { className: "tui-row" });
  for (const action of opts.rightActions ?? []) {
    right.appendChild(action);
  }

  return el("div", { className: "tui-header tui-spread" }, [left, right]);
}

export function section(opts: {
  title?: string;
  description?: string;
  content: HTMLElement;
}): HTMLElement {
  return el("section", { className: "tui-section" }, [
    opts.title ? el("div", { className: "tui-section-title", text: opts.title }) : null,
    opts.description
      ? el("div", { className: "tui-section-description", text: opts.description })
      : null,
    opts.content,
  ]);
}

export function card(opts: {
  className?: string;
  content?: HTMLElement | HTMLElement[];
} = {}): HTMLElement {
  const className = opts.className
    ? `tui-card ${opts.className}`.trim()
    : "tui-card";
  return el("div", { className }, normalizeContent(opts.content));
}

export function button(opts: {
  label: string;
  variant?: UIButtonVariant;
  size?: UIButtonSize;
  disabled?: boolean;
  onClick?: () => void;
}): HTMLButtonElement {
  const variant = opts.variant ?? "secondary";
  const size = opts.size ?? "md";
  return el("button", {
    className: `tui-btn tui-btn-${variant} tui-btn-${size}`,
    type: "button",
    text: opts.label,
    disabled: Boolean(opts.disabled),
    onClick: opts.onClick,
  });
}

export function input(opts: {
  value?: string;
  placeholder?: string;
  onInput?: (value: string) => void;
} = {}): HTMLInputElement {
  const node = el("input", {
    className: "tui-input",
    type: "text",
    value: opts.value ?? "",
    placeholder: opts.placeholder ?? "",
  });
  if (opts.onInput) {
    node.addEventListener("input", () => opts.onInput?.(node.value));
  }
  return node;
}

export function textarea(opts: {
  value?: string;
  placeholder?: string;
  rows?: number;
  onInput?: (value: string) => void;
} = {}): HTMLTextAreaElement {
  const node = el("textarea", {
    className: "tui-textarea",
    rows: opts.rows ?? 6,
    placeholder: opts.placeholder ?? "",
  });
  node.value = opts.value ?? "";
  if (opts.onInput) {
    node.addEventListener("input", () => opts.onInput?.(node.value));
  }
  return node;
}

export function select(opts: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}): HTMLSelectElement {
  const node = el("select", { className: "tui-select" });
  for (const option of opts.options) {
    node.appendChild(el("option", {
      value: option.value,
      text: option.label,
    }));
  }
  if (opts.value != null) {
    node.value = opts.value;
  }
  if (opts.onChange) {
    node.addEventListener("change", () => opts.onChange?.(node.value));
  }
  return node;
}

export function badge(opts: { label: string; tone?: BadgeTone }): HTMLElement {
  const tone = opts.tone ?? "neutral";
  return el("span", {
    className: `tui-badge tui-badge-${tone}`,
    text: opts.label,
  });
}

export function emptyState(opts: {
  title: string;
  description?: string;
  action?: HTMLButtonElement;
}): HTMLElement {
  const content: HTMLElement[] = [
    el("div", { className: "tui-empty-title", text: opts.title }),
  ];
  if (opts.description) {
    content.push(el("div", {
      className: "tui-empty-description",
      text: opts.description,
    }));
  }
  if (opts.action) {
    content.push(el("div", { className: "tui-row" }, [opts.action]));
  }
  return el("div", { className: "tui-empty" }, content);
}

export function group(opts: {
  title: UIGroupTitle;
  subtitle?: UIGroupSubtitle;
  expanded?: boolean;
  active?: boolean;
  animate?: boolean;
  meta?: HTMLElement[];
  actions?: HTMLElement[];
  content?: HTMLElement | HTMLElement[];
  onToggle?: (nextExpanded: boolean) => void;
}): HTMLElement {
  const expanded = opts.expanded ?? true;
  const hasToggle = typeof opts.onToggle === "function";
  const titleNode = normalizeNodeText(opts.title, "tui-group-title");
  const subtitleNode = normalizeNodeText(opts.subtitle, "tui-group-subtitle");
  const metaNodes = opts.meta ?? [];
  const actionNodes = opts.actions ?? [];

  const titleRow = el("div", { className: "tui-group-title-row" }, [
    titleNode,
    ...metaNodes,
  ]);

  const meta = el("div", { className: "tui-group-meta" }, [
    titleRow,
    subtitleNode,
  ]);

  const caret = hasToggle
    ? el("span", {
      className: `tui-group-caret${expanded ? " tui-group-caret-expanded" : ""}`,
      "aria-hidden": "true",
      text: "▾",
    })
    : null;

  const actions = el("div", {
    className: "tui-group-actions",
    onClick: (event: Event) => event.stopPropagation(),
  }, [
    ...actionNodes,
    caret,
  ]);

  const onToggle = () => {
    if (!opts.onToggle) return;
    opts.onToggle(!expanded);
  };

  const headerAttrs: Record<string, unknown> = {
    className: `tui-group-header${expanded ? "" : " tui-group-header-collapsed"}${hasToggle ? " tui-group-header-clickable" : ""}`,
  };

  if (hasToggle) {
    headerAttrs.role = "button";
    headerAttrs.tabIndex = 0;
    headerAttrs.onClick = onToggle;
    headerAttrs.onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onToggle();
    };
  }

  const header = el("div", headerAttrs, [meta, actions]);
  const initialCollapsed = opts.animate ? expanded : !expanded;
  const collapsible = el("div", {
    className: `tui-collapsible${initialCollapsed ? " is-collapsed" : ""}`,
  }, [
    el("div", { className: "tui-collapsible-inner" }, [
      el("div", { className: "tui-group-body" }, normalizeContent(opts.content)),
    ]),
  ]);

  if (opts.animate) {
    requestAnimationFrame(() => {
      collapsible.offsetHeight;
      requestAnimationFrame(() => {
        collapsible.classList.toggle("is-collapsed", !expanded);
      });
    });
  }

  return el("div", {
    className: `tui-group${expanded ? " tui-group-expanded" : ""}${opts.active ? " tui-group-active" : ""}`,
  }, [header, collapsible]);
}

export function groupList(opts: { items: HTMLElement[] }): HTMLElement {
  return el("div", { className: "tui-group-list" }, opts.items);
}

export function groupEmpty(opts: { text: string }): HTMLElement {
  return el("div", { className: "tui-group-empty", text: opts.text });
}

export function groupItem(opts: {
  title: string;
  subtitle?: string;
  meta?: UIGroupItemMeta;
  active?: boolean;
  onClick?: () => void;
}): HTMLElement {
  const main = el("div", { className: "tui-group-item-main" }, [
    el("span", { className: "tui-group-item-title", text: opts.title }),
    opts.subtitle
      ? el("span", { className: "tui-group-item-subtitle", text: opts.subtitle })
      : null,
  ]);

  let metaNode: HTMLElement | null = null;
  if (opts.meta) {
    if (typeof opts.meta === "string") {
      metaNode = el("span", { className: "tui-group-item-meta", text: opts.meta });
    } else {
      opts.meta.classList.add("tui-group-item-meta");
      metaNode = opts.meta;
    }
  }

  const children = metaNode ? [main, metaNode] : [main];
  const className = `tui-group-item${opts.active ? " tui-group-item-active" : ""}`;
  if (opts.onClick) {
    return el("button", {
      className,
      type: "button",
      onClick: opts.onClick,
    }, children);
  }

  return el("div", { className }, children);
}

export function list(opts: { items: HTMLElement[] }): HTMLElement {
  return el("div", { className: "tui-list", role: "list" }, opts.items);
}

export function listItem(opts: {
  title: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
}): HTMLElement {
  const content = [
    el("span", { className: "tui-list-item-title", text: opts.title }),
    opts.subtitle
      ? el("span", { className: "tui-list-item-subtitle", text: opts.subtitle })
      : null,
  ];

  if (opts.onClick) {
    return el("button", {
      className: `tui-list-item${opts.active ? " tui-list-item-active" : ""}`,
      type: "button",
      role: "listitem",
      onClick: opts.onClick,
    }, content);
  }

  const node = el("div", {
    className: `tui-list-item${opts.active ? " tui-list-item-active" : ""}`,
    role: "listitem",
  });
  appendChildren(node, content);
  return node;
}
