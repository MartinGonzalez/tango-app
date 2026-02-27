import { clearChildren, h } from "../lib/dom.ts";
import type { InstrumentRegistryEntry } from "../../shared/types.ts";

export type InstrumentsSidebarCallbacks = {
  onActivate: (instrumentId: string) => void;
  onBack: () => void;
  onAddLocal: () => void;
  onToggleEnabled: (instrumentId: string, enabled: boolean) => void;
  onRemoveLocal: (instrumentId: string) => void;
  onRetryMigration: (instrumentId: string) => void;
};

export class InstrumentsSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: InstrumentsSidebarCallbacks;
  #entries: InstrumentRegistryEntry[] = [];
  #activeId: string | null = null;
  #loading = false;
  #error: string | null = null;

  constructor(container: HTMLElement, callbacks: InstrumentsSidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "tasks-sidebar-header" }, [
      h("button", {
        class: "tasks-sidebar-back-btn",
        title: "Back to stages",
        onclick: () => this.#callbacks.onBack(),
      }, ["\u2190"]),
      h("span", { class: "tasks-sidebar-title" }, ["Instruments"]),
      h("button", {
        class: "tasks-sidebar-back-btn",
        title: "Add local instrument",
        onclick: () => this.#callbacks.onAddLocal(),
      }, ["+"]),
    ]);

    this.#listEl = h("div", { class: "tasks-sidebar-list" });

    this.#el = h("div", { class: "tasks-sidebar" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(
    entries: InstrumentRegistryEntry[],
    opts?: { loading?: boolean; error?: string | null }
  ): void {
    this.#entries = entries.slice();
    this.#loading = Boolean(opts?.loading);
    this.#error = opts?.error ? String(opts.error) : null;
    this.#renderContent();
  }

  setActive(instrumentId: string | null): void {
    this.#activeId = instrumentId;
    this.#renderContent();
  }

  #renderContent(): void {
    clearChildren(this.#listEl);

    if (this.#loading) {
      this.#listEl.appendChild(h("div", { class: "tasks-sidebar-empty" }, ["Loading instruments..."]));
      return;
    }

    if (this.#error) {
      this.#listEl.appendChild(
        h("div", { class: "tasks-banner tasks-banner-error" }, [this.#error])
      );
    }

    if (this.#entries.length === 0) {
      this.#listEl.appendChild(h("div", { class: "tasks-sidebar-empty" }, ["No instruments installed"]));
      return;
    }

    for (const entry of this.#entries) {
      this.#listEl.appendChild(this.#renderEntry(entry));
    }
  }

  #renderEntry(entry: InstrumentRegistryEntry): HTMLElement {
    const active = entry.id === this.#activeId;

    const statusLabel = entry.status === "blocked"
      ? "Blocked"
      : entry.enabled
        ? "Enabled"
        : "Disabled";

    const row = h("div", {
      class: `task-group${active ? " active" : ""}`,
    }, [
      h("button", {
        class: `task-row${active ? " active" : ""}`,
        title: `${entry.name} (${entry.id})`,
        onclick: () => this.#callbacks.onActivate(entry.id),
      }, [
        h("span", { class: "task-row-title" }, [`${entry.name}`]),
        h("div", { class: "task-row-meta" }, [
          h("span", { class: "task-row-time" }, [entry.group]),
          h("span", { class: "task-row-status" }, [statusLabel]),
        ]),
      ]),
      h("div", { class: "task-group-list" }, [
        h("div", { class: "plugins-content-toolbar" }, [
          h("button", {
            class: "plugins-content-btn",
            type: "button",
            onclick: () => this.#callbacks.onToggleEnabled(entry.id, !entry.enabled),
          }, [entry.enabled ? "Disable" : "Enable"]),
          !entry.isBundled
            ? h("button", {
                class: "plugins-content-btn",
                type: "button",
                onclick: () => this.#callbacks.onRemoveLocal(entry.id),
              }, ["Uninstall"])
            : h("span", { class: "task-group-empty" }, ["Bundled"]),
          entry.status === "blocked"
            ? h("button", {
                class: "plugins-content-btn",
                type: "button",
                onclick: () => this.#callbacks.onRetryMigration(entry.id),
              }, ["Retry migration"])
            : h("span", { hidden: true }),
        ]),
        entry.lastError
          ? h("div", { class: "tasks-banner tasks-banner-error" }, [entry.lastError])
          : h("div", { hidden: true }),
      ]),
    ]);

    return row;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
