export type DOMChild = Node | string | number | null | undefined | false;

type DOMStyleValue = string | number | null | undefined;
type DOMStyleRecord = Record<string, DOMStyleValue>;
type DOMDatasetRecord = Record<string, string | number | null | undefined>;

type DOMAttributes = {
  className?: string;
  text?: string;
  ariaLabel?: string;
  role?: string;
  title?: string;
  type?: string;
  disabled?: boolean;
  value?: string;
  placeholder?: string;
  rows?: number;
  tabIndex?: number;
  style?: DOMStyleRecord;
  dataset?: DOMDatasetRecord;
  [key: string]: unknown;
};

type DOMEventName = `on${string}`;
type DOMEventHandler = EventListenerOrEventListenerObject;

function cssPropertyName(name: string): string {
  return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function setStyle(node: HTMLElement, style: DOMStyleRecord): void {
  for (const [key, rawValue] of Object.entries(style)) {
    if (rawValue == null) continue;
    const value = typeof rawValue === "number" ? String(rawValue) : rawValue;
    node.style.setProperty(cssPropertyName(key), value);
  }
}

function setDataset(node: HTMLElement, dataset: DOMDatasetRecord): void {
  for (const [key, rawValue] of Object.entries(dataset)) {
    if (rawValue == null) continue;
    node.dataset[key] = String(rawValue);
  }
}

function setBooleanAttribute(node: HTMLElement, name: string, value: unknown): void {
  if (value) node.setAttribute(name, "");
  else node.removeAttribute(name);
}

function applyAttribute(node: HTMLElement, key: string, value: unknown): void {
  if (value == null) return;

  if (key === "className") {
    node.className = String(value);
    return;
  }
  if (key === "text") {
    node.textContent = String(value);
    return;
  }
  if (key === "style" && typeof value === "object") {
    setStyle(node, value as DOMStyleRecord);
    return;
  }
  if (key === "dataset" && typeof value === "object") {
    setDataset(node, value as DOMDatasetRecord);
    return;
  }
  if (key === "disabled") {
    setBooleanAttribute(node, "disabled", value);
    return;
  }

  if ((key as DOMEventName).startsWith("on") && typeof value === "function") {
    const eventName = key.slice(2).toLowerCase();
    node.addEventListener(eventName, value as DOMEventHandler);
    return;
  }

  node.setAttribute(key, String(value));
}

export function appendChildren(node: HTMLElement, children: DOMChild[] = []): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
      continue;
    }
    node.appendChild(child);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: DOMAttributes = {},
  children: DOMChild[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    applyAttribute(node, key, value);
  }
  appendChildren(node, children);
  return node;
}
