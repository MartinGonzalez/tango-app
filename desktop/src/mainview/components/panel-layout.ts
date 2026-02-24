import { h } from "../lib/dom.ts";

export type PanelConfig = {
  id: string;
  minWidth: number;
  defaultWidth: number; // percentage of total (0-100), or 0 for hidden
  hidden?: boolean;
  fixedPercent?: number; // fixed percentage of total width while visible
  resizable?: boolean; // defaults to false when fixedPercent is set
};

/**
 * Horizontal resizable panel layout. Each panel has a drag handle
 * on its right edge. Panels can be shown/hidden.
 */
export class PanelLayout {
  #el: HTMLElement;
  #panels: Map<string, PanelState> = new Map();
  #order: string[] = [];
  #handles: HTMLElement[] = [];
  #dragging: { handleIndex: number; startX: number; leftId: string; rightId: string; leftStart: number; rightStart: number } | null = null;

  constructor(container: HTMLElement, configs: PanelConfig[]) {
    this.#el = h("div", { class: "panel-layout" });
    this.#order = configs.map((cfg) => cfg.id);

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
        currentWidth: cfg.hidden
          ? 0
          : this.#initialCurrentPercent(cfg),
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
    this.#rebalance();
  }

  getPanel(id: string): HTMLElement | null {
    return this.#panels.get(id)?.el ?? null;
  }

  showPanel(id: string): void {
    const state = this.#panels.get(id);
    if (!state || !state.hidden) return;

    this.#captureCurrentWidths();
    state.hidden = false;
    state.el.classList.remove("panel-hidden");
    if (this.#isFixedPanel(state.config)) {
      state.currentWidth = this.#fixedPercent(state.config);
    } else if (state.currentWidth <= 0) {
      state.currentWidth = this.#initialPercent(state.config);
    }
    state.el.style.width = "";
    state.el.style.minWidth = state.config.minWidth + "px";
    this.#rebalance();
  }

  hidePanel(id: string): void {
    const state = this.#panels.get(id);
    if (!state || state.hidden) return;

    this.#captureCurrentWidths();
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

  setPanelSizing(
    id: string,
    options: {
      fixedPercent?: number | null;
      resizable?: boolean;
    }
  ): void {
    const state = this.#panels.get(id);
    if (!state) return;

    if (options.fixedPercent !== undefined) {
      const next = options.fixedPercent;
      if (next == null || !Number.isFinite(next) || next <= 0) {
        delete state.config.fixedPercent;
      } else {
        state.config.fixedPercent = next;
      }
    }

    if (options.resizable !== undefined) {
      state.config.resizable = options.resizable;
    }

    if (!state.hidden && this.#isFixedPanel(state.config)) {
      state.currentWidth = this.#fixedPercent(state.config);
    }

    this.#rebalance();
  }

  preservePanelPixelWidth(id: string, pixelWidth: number): void {
    const state = this.#panels.get(id);
    if (
      !state
      || state.hidden
      || !this.#isPanelResizable(state)
      || !Number.isFinite(pixelWidth)
      || pixelWidth <= 0
    ) {
      return;
    }

    const visible = this.#visiblePanels();
    if (visible.length === 0) return;

    const totalPixels = visible.reduce((sum, panel) => sum + panel.el.offsetWidth, 0);
    if (totalPixels <= 0) return;

    const minPercent = (state.config.minWidth / totalPixels) * 100;
    const others = visible.filter((panel) => panel !== state);
    const minOthers = others.length * 0.1;
    const unclamped = (pixelWidth / totalPixels) * 100;
    const nextPercent = clamp(
      unclamped,
      minPercent,
      Math.max(minPercent, 100 - minOthers)
    );

    state.currentWidth = nextPercent;
    const remaining = Math.max(0, 100 - nextPercent);

    if (others.length > 0) {
      const othersTotal = others.reduce(
        (sum, panel) => sum + Math.max(0.1, panel.currentWidth),
        0
      );
      if (othersTotal <= 0) {
        const even = remaining / others.length;
        for (const panel of others) {
          panel.currentWidth = even;
        }
      } else {
        for (const panel of others) {
          const base = Math.max(0.1, panel.currentWidth);
          panel.currentWidth = (base / othersTotal) * remaining;
        }
      }
    }

    this.#rebalance();
  }

  #startDrag(handleIndex: number, startX: number, leftId: string, rightId: string): void {
    const leftPanel = this.#panels.get(leftId)!;
    const rightPanel = this.#panels.get(rightId)!;

    // Skip if either panel is hidden or not resizable.
    if (
      leftPanel.hidden
      || rightPanel.hidden
      || !this.#isPanelResizable(leftPanel)
      || !this.#isPanelResizable(rightPanel)
    ) {
      return;
    }

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
    this.#captureCurrentWidths();
    this.#rebalance();
  }

  #rebalance(): void {
    const visible = this.#visiblePanels();
    if (visible.length > 0) {
      const fixed = visible.filter((state) => this.#isFixedPanel(state.config));
      const fluid = visible.filter((state) => !this.#isFixedPanel(state.config));

      if (fluid.length === 0) {
        // When only fixed panels are visible, fill available width to avoid empty space.
        const total = fixed.reduce(
          (sum, state) => sum + Math.max(0.1, this.#fixedPercent(state.config)),
          0
        );
        for (const state of fixed) {
          const grow = Math.max(0.1, (this.#fixedPercent(state.config) / total) * 100);
          state.currentWidth = grow;
          state.el.style.width = "";
          state.el.style.flex = `${grow} 1 0px`;
          state.el.style.minWidth = state.config.minWidth + "px";
        }
      } else {
        const fixedTotal = fixed.reduce(
          (sum, state) => sum + this.#fixedPercent(state.config),
          0
        );
        const remaining = Math.max(0, 100 - fixedTotal);

        for (const state of fixed) {
          const percent = this.#fixedPercent(state.config);
          state.currentWidth = percent;
          state.el.style.width = "";
          state.el.style.flex = `0 0 ${percent}%`;
          state.el.style.minWidth = state.config.minWidth + "px";
        }

        let totalFluid = fluid.reduce((sum, state) => sum + Math.max(0, state.currentWidth), 0);
        if (totalFluid <= 0) {
          const even = remaining / fluid.length;
          for (const state of fluid) {
            state.currentWidth = even;
          }
          totalFluid = remaining;
        }
        for (const state of fluid) {
          const grow = Math.max(0.1, (state.currentWidth / totalFluid) * remaining);
          state.currentWidth = grow;
          state.el.style.width = "";
          state.el.style.flex = `${grow} 1 0px`;
          state.el.style.minWidth = state.config.minWidth + "px";
        }
      }
    }

    for (const state of this.#panels.values()) {
      if (!state.hidden) continue;
      state.el.style.flex = "0 0 0px";
      state.el.style.width = "0px";
      state.el.style.minWidth = "0px";
    }

    this.#updateHandleVisibility();
  }

  #captureCurrentWidths(): void {
    const visible = this.#visiblePanels();
    if (visible.length === 0) return;

    const totalWidth = visible.reduce((sum, state) => sum + state.el.offsetWidth, 0);
    if (totalWidth <= 0) return;

    for (const state of visible) {
      if (this.#isFixedPanel(state.config)) continue;
      state.currentWidth = (state.el.offsetWidth / totalWidth) * 100;
    }
  }

  #visiblePanels(): PanelState[] {
    const out: PanelState[] = [];
    for (const id of this.#order) {
      const state = this.#panels.get(id);
      if (!state || state.hidden) continue;
      out.push(state);
    }
    return out;
  }

  #updateHandleVisibility(): void {
    for (let i = 0; i < this.#handles.length; i++) {
      const left = this.#panels.get(this.#order[i]);
      const right = this.#panels.get(this.#order[i + 1]);
      const show = Boolean(
        left
        && right
        && !left.hidden
        && !right.hidden
        && this.#isPanelResizable(left)
        && this.#isPanelResizable(right)
      );
      this.#handles[i].style.display = show ? "" : "none";
    }
  }

  #isFixedPanel(config: PanelConfig): boolean {
    return Number.isFinite(config.fixedPercent) && (config.fixedPercent ?? 0) > 0;
  }

  #fixedPercent(config: PanelConfig): number {
    return clamp(config.fixedPercent ?? 0, 0, 100);
  }

  #isPanelResizable(state: PanelState): boolean {
    if (this.#isFixedPanel(state.config)) return false;
    return state.config.resizable ?? true;
  }

  #initialCurrentPercent(config: PanelConfig): number {
    if (this.#isFixedPanel(config)) return this.#fixedPercent(config);
    return config.defaultWidth;
  }

  #initialPercent(config: PanelConfig): number {
    if (config.defaultWidth > 0) return config.defaultWidth;
    const containerWidth = Math.max(this.#el.clientWidth, 1);
    const minPercent = (config.minWidth / containerWidth) * 100;
    return Math.min(40, Math.max(8, minPercent));
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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
