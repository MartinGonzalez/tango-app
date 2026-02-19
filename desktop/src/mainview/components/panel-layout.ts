import { h } from "../lib/dom.ts";

export type PanelConfig = {
  id: string;
  minWidth: number;
  defaultWidth: number; // percentage of total (0-100), or 0 for hidden
  hidden?: boolean;
};

/**
 * Horizontal resizable panel layout. Each panel has a drag handle
 * on its right edge. Panels can be shown/hidden.
 */
export class PanelLayout {
  #el: HTMLElement;
  #panels: Map<string, PanelState> = new Map();
  #handles: HTMLElement[] = [];
  #dragging: { handleIndex: number; startX: number; leftId: string; rightId: string; leftStart: number; rightStart: number } | null = null;

  constructor(container: HTMLElement, configs: PanelConfig[]) {
    this.#el = h("div", { class: "panel-layout" });

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const panel = h("div", {
        class: `panel panel-${cfg.id}`,
        dataset: { panelId: cfg.id },
      });

      if (cfg.hidden) {
        panel.style.width = "0px";
        panel.style.minWidth = "0px";
        panel.classList.add("panel-hidden");
      } else {
        panel.style.width = cfg.defaultWidth + "%";
        panel.style.minWidth = cfg.minWidth + "px";
      }

      this.#panels.set(cfg.id, {
        el: panel,
        config: cfg,
        hidden: cfg.hidden ?? false,
        currentWidth: cfg.hidden ? 0 : cfg.defaultWidth,
      });

      this.#el.appendChild(panel);

      // Add drag handle between panels (not after the last one)
      if (i < configs.length - 1) {
        const handle = h("div", {
          class: "panel-handle",
          dataset: { handleIndex: String(i) },
        });
        this.#el.appendChild(handle);
        this.#handles.push(handle);

        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.#startDrag(i, e.clientX, configs[i].id, configs[i + 1].id);
        });
      }
    }

    // Global mouse handlers for dragging
    document.addEventListener("mousemove", (e) => this.#onDrag(e));
    document.addEventListener("mouseup", () => this.#endDrag());

    container.appendChild(this.#el);
  }

  getPanel(id: string): HTMLElement | null {
    return this.#panels.get(id)?.el ?? null;
  }

  showPanel(id: string): void {
    const state = this.#panels.get(id);
    if (!state || !state.hidden) return;

    state.hidden = false;
    state.el.classList.remove("panel-hidden");
    state.el.style.width = state.config.defaultWidth + "%";
    state.el.style.minWidth = state.config.minWidth + "px";
    this.#rebalance();
  }

  hidePanel(id: string): void {
    const state = this.#panels.get(id);
    if (!state || state.hidden) return;

    state.hidden = true;
    state.el.classList.add("panel-hidden");
    state.el.style.width = "0px";
    state.el.style.minWidth = "0px";
    this.#rebalance();
  }

  togglePanel(id: string): void {
    const state = this.#panels.get(id);
    if (!state) return;
    if (state.hidden) this.showPanel(id);
    else this.hidePanel(id);
  }

  isPanelVisible(id: string): boolean {
    return !(this.#panels.get(id)?.hidden ?? true);
  }

  #startDrag(handleIndex: number, startX: number, leftId: string, rightId: string): void {
    const leftPanel = this.#panels.get(leftId)!;
    const rightPanel = this.#panels.get(rightId)!;

    // Skip if either panel is hidden
    if (leftPanel.hidden || rightPanel.hidden) return;

    this.#dragging = {
      handleIndex,
      startX,
      leftId,
      rightId,
      leftStart: leftPanel.el.offsetWidth,
      rightStart: rightPanel.el.offsetWidth,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    this.#el.classList.add("dragging");
  }

  #onDrag(e: MouseEvent): void {
    if (!this.#dragging) return;

    const delta = e.clientX - this.#dragging.startX;
    const leftPanel = this.#panels.get(this.#dragging.leftId)!;
    const rightPanel = this.#panels.get(this.#dragging.rightId)!;

    let newLeftWidth = this.#dragging.leftStart + delta;
    let newRightWidth = this.#dragging.rightStart - delta;

    // Enforce minimums
    if (newLeftWidth < leftPanel.config.minWidth) {
      newLeftWidth = leftPanel.config.minWidth;
      newRightWidth = this.#dragging.leftStart + this.#dragging.rightStart - newLeftWidth;
    }
    if (newRightWidth < rightPanel.config.minWidth) {
      newRightWidth = rightPanel.config.minWidth;
      newLeftWidth = this.#dragging.leftStart + this.#dragging.rightStart - newRightWidth;
    }

    leftPanel.el.style.width = newLeftWidth + "px";
    rightPanel.el.style.width = newRightWidth + "px";
    // Remove % flex-basis so pixel widths work
    leftPanel.el.style.flex = "none";
    rightPanel.el.style.flex = "none";
  }

  #endDrag(): void {
    if (!this.#dragging) return;
    this.#dragging = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.#el.classList.remove("dragging");
  }

  #rebalance(): void {
    // After showing/hiding, reset flex on visible panels
    for (const [_, state] of this.#panels) {
      if (!state.hidden) {
        state.el.style.flex = "";
      }
    }
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

type PanelState = {
  el: HTMLElement;
  config: PanelConfig;
  hidden: boolean;
  currentWidth: number;
};
