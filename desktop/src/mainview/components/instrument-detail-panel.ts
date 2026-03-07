import { clearChildren, h } from "../lib/dom.ts";
import type {
  InstrumentRegistryEntry,
  InstrumentCatalogEntry,
  InstrumentCategory,
} from "../../shared/types.ts";

type DetailTarget =
  | { kind: "installed"; entry: InstrumentRegistryEntry }
  | { kind: "catalog"; entry: InstrumentCatalogEntry }
  | null;

export type InstrumentDetailCallbacks = {
  onActivate: (instrumentId: string) => void;
  onInstall: (entry: InstrumentCatalogEntry) => void;
};

const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  "developer-tools": "Developer Tools",
  "productivity": "Productivity",
  "media": "Media",
  "communication": "Communication",
  "finance": "Finance",
  "utilities": "Utilities",
};

export class InstrumentDetailPanel {
  #el: HTMLElement;
  #contentEl: HTMLElement;
  #callbacks: InstrumentDetailCallbacks;
  #target: DetailTarget = null;

  constructor(callbacks: InstrumentDetailCallbacks) {
    this.#callbacks = callbacks;
    this.#contentEl = h("div", { class: "instrument-detail-content" });
    this.#el = h("div", { class: "instrument-detail-panel" }, [
      this.#contentEl,
    ]);
  }

  showInstalled(entry: InstrumentRegistryEntry): void {
    this.#target = { kind: "installed", entry };
    this.#render();
  }

  showCatalog(entry: InstrumentCatalogEntry): void {
    this.#target = { kind: "catalog", entry };
    this.#render();
  }

  clear(): void {
    this.#target = null;
    this.#render();
  }

  #render(): void {
    clearChildren(this.#contentEl);

    if (!this.#target) {
      this.#contentEl.appendChild(
        h("div", { class: "instrument-detail-empty" }, [
          h("span", { class: "instrument-detail-empty-icon" }, ["\u{1F50D}"]),
          h("p", {}, ["Select an instrument to see details"]),
        ]),
      );
      return;
    }

    if (this.#target.kind === "installed") {
      this.#renderInstalled(this.#target.entry);
    } else {
      this.#renderCatalog(this.#target.entry);
    }
  }

  #renderInstalled(entry: InstrumentRegistryEntry): void {
    const icon = entry.launcher?.sidebarShortcut?.icon ?? "puzzle";
    const category = entry.category
      ? CATEGORY_LABELS[entry.category] ?? entry.category
      : "Uncategorized";

    const statusClass = entry.status === "active" ? "status-active"
      : entry.status === "blocked" ? "status-blocked"
      : "status-disabled";

    this.#contentEl.append(
      h("div", { class: "instrument-detail-header" }, [
        h("div", { class: "instrument-detail-icon" }, [this.#iconEl(icon)]),
        h("div", { class: "instrument-detail-title-group" }, [
          h("h2", { class: "instrument-detail-name" }, [entry.name]),
          h("span", { class: "instrument-detail-id" }, [entry.id]),
        ]),
      ]),
      h("div", { class: "instrument-detail-meta" }, [
        h("span", { class: `instrument-detail-status ${statusClass}` }, [
          entry.enabled ? "Enabled" : "Disabled",
        ]),
        h("span", { class: "instrument-detail-badge" }, [category]),
        h("span", { class: "instrument-detail-badge" }, [`v${entry.version}`]),
        entry.isBundled
          ? h("span", { class: "instrument-detail-badge" }, ["Bundled"])
          : h("span", { class: "instrument-detail-badge" }, ["Local"]),
      ]),
      this.#renderSection("Panels", this.#panelsList(entry.panels)),
      this.#renderSection("Permissions", this.#permissionsList(entry.permissions)),
      entry.enabled && entry.status === "active"
        ? h("div", { class: "instrument-detail-actions" }, [
            h("button", {
              class: "instrument-detail-btn instrument-detail-btn-primary",
              onclick: () => this.#callbacks.onActivate(entry.id),
            }, ["Open Instrument"]),
          ])
        : h("div", { hidden: true }),
    );
  }

  #renderCatalog(entry: InstrumentCatalogEntry): void {
    const icon = entry.icon ?? "puzzle";
    const category = entry.category
      ? CATEGORY_LABELS[entry.category] ?? entry.category
      : "Uncategorized";

    this.#contentEl.append(
      h("div", { class: "instrument-detail-header" }, [
        h("div", { class: "instrument-detail-icon" }, [this.#iconEl(icon)]),
        h("div", { class: "instrument-detail-title-group" }, [
          h("h2", { class: "instrument-detail-name" }, [entry.name]),
          h("span", { class: "instrument-detail-id" }, [entry.id]),
        ]),
      ]),
      h("div", { class: "instrument-detail-meta" }, [
        h("span", { class: "instrument-detail-badge" }, [category]),
        h("span", { class: "instrument-detail-badge" }, [`v${entry.version}`]),
        entry.author
          ? h("span", { class: "instrument-detail-badge" }, [`by ${entry.author}`])
          : h("span", { hidden: true }),
      ]),
      entry.description
        ? h("div", { class: "instrument-detail-description" }, [entry.description])
        : h("div", { hidden: true }),
      this.#renderSection("Panels", this.#panelsList(entry.panels)),
      this.#renderSection("Permissions", this.#permissionsList(entry.permissions)),
      h("div", { class: "instrument-detail-actions" }, [
        entry.installed
          ? h("span", { class: "instrument-detail-badge" }, ["Already installed"])
          : h("button", {
              class: "instrument-detail-btn instrument-detail-btn-primary",
              onclick: () => this.#callbacks.onInstall(entry),
            }, ["Install"]),
      ]),
    );
  }

  #renderSection(title: string, content: HTMLElement): HTMLElement {
    return h("div", { class: "instrument-detail-section" }, [
      h("h3", { class: "instrument-detail-section-title" }, [title]),
      content,
    ]);
  }

  #panelsList(panels: { sidebar: boolean; first: boolean; second: boolean; right: boolean }): HTMLElement {
    const active = Object.entries(panels)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (active.length === 0) {
      return h("span", { class: "instrument-detail-muted" }, ["None"]);
    }
    return h("div", { class: "instrument-detail-tags" },
      active.map((name) => h("span", { class: "instrument-detail-tag" }, [name])),
    );
  }

  #permissionsList(permissions: string[]): HTMLElement {
    if (permissions.length === 0) {
      return h("span", { class: "instrument-detail-muted" }, ["No special permissions"]);
    }
    return h("div", { class: "instrument-detail-tags" },
      permissions.map((p) => h("span", { class: "instrument-detail-tag" }, [p])),
    );
  }

  #iconEl(icon: string): HTMLElement {
    return h("span", { class: "instrument-detail-icon-glyph" }, [icon]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
