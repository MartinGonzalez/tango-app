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
  onUninstall: (instrumentId: string) => void;
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
  #installing = false;

  constructor(callbacks: InstrumentDetailCallbacks) {
    this.#callbacks = callbacks;
    this.#contentEl = h("div", { class: "instrument-detail-content" });
    this.#el = h("div", { class: "instrument-detail-panel" }, [
      this.#contentEl,
    ]);
  }

  showInstalled(entry: InstrumentRegistryEntry): void {
    this.#target = { kind: "installed", entry };
    this.#installing = false;
    this.#render();
  }

  showCatalog(entry: InstrumentCatalogEntry): void {
    this.#target = { kind: "catalog", entry };
    this.#installing = false;
    this.#render();
  }

  setInstalling(installing: boolean): void {
    this.#installing = installing;
    this.#render();
  }

  clear(): void {
    this.#target = null;
    this.#installing = false;
    this.#render();
  }

  #render(): void {
    clearChildren(this.#contentEl);

    if (!this.#target) {
      this.#contentEl.appendChild(
        h("div", { class: "instrument-detail-empty" }, [
          h("p", { class: "instrument-detail-empty-text" }, ["Select an instrument to see details"]),
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
      : null;

    // Header with action button top-right
    const actionBtn = entry.isBundled
      ? h("span", { class: "instrument-detail-badge" }, ["Bundled"])
      : h("button", {
          class: "instrument-detail-btn instrument-detail-btn-danger",
          onclick: () => this.#callbacks.onUninstall(entry.id),
        }, ["Uninstall"]);

    this.#contentEl.append(
      // Top row: icon + title + action button
      h("div", { class: "instrument-detail-top" }, [
        h("div", { class: "instrument-detail-header" }, [
          h("div", { class: "instrument-detail-icon" }, [this.#iconEl(icon)]),
          h("div", { class: "instrument-detail-title-group" }, [
            h("h2", { class: "instrument-detail-name" }, [entry.name]),
            h("span", { class: "instrument-detail-id" }, [entry.id]),
          ]),
        ]),
        actionBtn,
      ]),
      // Description
      entry.description
        ? h("div", { class: "instrument-detail-description" }, [entry.description])
        : h("div", { hidden: true }),
      // Meta badges
      h("div", { class: "instrument-detail-meta" }, [
        ...(category ? [h("span", { class: "instrument-detail-badge" }, [category])] : []),
        h("span", { class: "instrument-detail-badge" }, [`v${entry.version}`]),
        h("span", { class: "instrument-detail-badge" }, [entry.group]),
      ]),
      // Sections
      this.#renderSection("Panels", this.#panelsList(entry.panels)),
      this.#renderSection("Permissions", this.#permissionsList(entry.permissions)),
      // Open button
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
      : null;

    // Action button: Install / Installing... / Already Installed
    let actionBtn: HTMLElement;
    if (entry.installed) {
      actionBtn = h("span", { class: "instrument-detail-badge instrument-detail-installed-badge" }, ["Installed"]);
    } else if (this.#installing) {
      actionBtn = h("button", {
        class: "instrument-detail-btn instrument-detail-btn-install",
        disabled: true,
      }, ["Installing..."]);
    } else {
      actionBtn = h("button", {
        class: "instrument-detail-btn instrument-detail-btn-install",
        onclick: () => this.#callbacks.onInstall(entry),
      }, ["Install"]);
    }

    this.#contentEl.append(
      // Top row: icon + title + action button
      h("div", { class: "instrument-detail-top" }, [
        h("div", { class: "instrument-detail-header" }, [
          h("div", { class: "instrument-detail-icon" }, [this.#iconEl(icon)]),
          h("div", { class: "instrument-detail-title-group" }, [
            h("h2", { class: "instrument-detail-name" }, [entry.name]),
            h("span", { class: "instrument-detail-id" }, [entry.id]),
          ]),
        ]),
        actionBtn,
      ]),
      // Description
      entry.description
        ? h("div", { class: "instrument-detail-description" }, [entry.description])
        : h("div", { hidden: true }),
      // Meta badges
      h("div", { class: "instrument-detail-meta" }, [
        ...(category ? [h("span", { class: "instrument-detail-badge" }, [category])] : []),
        h("span", { class: "instrument-detail-badge" }, [`v${entry.version}`]),
        entry.author
          ? h("span", { class: "instrument-detail-badge" }, [`by ${entry.author}`])
          : h("span", { hidden: true }),
      ]),
      // Sections
      this.#renderSection("Panels", this.#panelsList(entry.panels)),
      this.#renderSection("Permissions", this.#permissionsList(entry.permissions)),
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
