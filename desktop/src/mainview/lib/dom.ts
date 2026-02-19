/**
 * Minimal element factory. Usage:
 *   h("div", { class: "foo", onclick: handler }, [child1, "text"])
 */
export function h(
  tag: string,
  attrs?: Record<string, any> | null,
  children?: (HTMLElement | string)[]
): HTMLElement {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key === "class" || key === "className") {
        el.className = val;
      } else if (key === "style" && typeof val === "object") {
        Object.assign(el.style, val);
      } else if (key.startsWith("on") && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === "dataset" && typeof val === "object") {
        for (const [dk, dv] of Object.entries(val)) {
          el.dataset[dk] = String(dv);
        }
      } else if (key === "hidden") {
        el.hidden = Boolean(val);
      } else if (key === "innerHTML") {
        el.innerHTML = val;
      } else {
        el.setAttribute(key, String(val));
      }
    }
  }

  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    }
  }

  return el;
}

/**
 * Query helper with type assertion.
 */
export function qs<T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: HTMLElement | Document = document
): T | null {
  return parent.querySelector<T>(selector);
}

/**
 * Clear all children of an element.
 */
export function clearChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
