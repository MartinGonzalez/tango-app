import { clearChildren, h } from "../lib/dom.ts";
import { instrumentIcon } from "../lib/icons.ts";
import { compareSemver } from "../../shared/version.ts";
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
  onUpdate: (entry: InstrumentCatalogEntry) => void;
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
  #updating = false;
  #justUpdated = false;

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
    this.#updating = false;
    this.#render();
  }

  showCatalog(entry: InstrumentCatalogEntry): void {
    this.#target = { kind: "catalog", entry };
    this.#installing = false;
    this.#updating = false;
    this.#render();
  }

  showUpdated(entry: InstrumentCatalogEntry): void {
    this.#target = { kind: "catalog", entry };
    this.#installing = false;
    this.#updating = false;
    this.#justUpdated = true;
    this.#render();
    setTimeout(() => {
      this.#justUpdated = false;
      this.#render();
    }, 3000);
  }

  setInstalling(installing: boolean): void {
    this.#installing = installing;
    this.#render();
  }

  setUpdating(updating: boolean): void {
    this.#updating = updating;
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

    const t = this.#target;
    const isInstalled = t.kind === "installed";
    const entry = t.entry;

    // Common fields
    const icon = isInstalled
      ? (entry as InstrumentRegistryEntry).launcher?.sidebarShortcut?.icon ?? "puzzle"
      : (entry as InstrumentCatalogEntry).icon ?? "puzzle";
    const category = entry.category
      ? CATEGORY_LABELS[entry.category] ?? entry.category
      : null;
    const author = !isInstalled ? (entry as InstrumentCatalogEntry).author : null;

    // Action button
    const actionBtn = this.#buildActionButton(t);

    this.#contentEl.append(
      // Top row: icon + title + action
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
        ...(author ? [h("span", { class: "instrument-detail-badge" }, [`by ${author}`])] : []),
      ]),
      // Sections
      this.#renderSection("Panels", this.#panelsList(entry.panels)),
      this.#renderSection("Permissions", this.#permissionsList(entry.permissions)),
    );
  }

  #buildActionButton(target: NonNullable<DetailTarget>): HTMLElement {
    if (target.kind === "installed") {
      const entry = target.entry;
      if (entry.isBundled) {
        return h("span", { class: "instrument-detail-badge" }, ["Bundled"]);
      }
      if (entry.devMode) {
        return h("div", { class: "instrument-detail-action-group" }, [
          h("span", { class: "instrument-detail-badge instrument-badge-local" }, ["Dev"]),
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-danger",
            onclick: () => this.#callbacks.onUninstall(entry.id),
          }, ["Uninstall"]),
        ]);
      }
      return h("button", {
        class: "instrument-detail-btn instrument-detail-btn-danger",
        onclick: () => this.#callbacks.onUninstall(entry.id),
      }, ["Uninstall"]);
    }

    const entry = target.entry;

    if (entry.installed) {
      const hasUpdate = entry.installedVersion
        ? compareSemver(entry.version, entry.installedVersion) > 0
        : false;

      if (this.#updating) {
        return h("div", { class: "instrument-detail-action-group" }, [
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-install",
            disabled: true,
          }, ["Updating..."]),
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-danger",
            disabled: true,
          }, ["Uninstall"]),
        ]);
      }

      if (this.#justUpdated) {
        return h("div", { class: "instrument-detail-action-group" }, [
          h("span", { class: "instrument-detail-badge instrument-detail-updated-badge" }, ["Updated!"]),
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-danger",
            onclick: () => this.#callbacks.onUninstall(entry.id),
          }, ["Uninstall"]),
        ]);
      }

      if (hasUpdate) {
        return h("div", { class: "instrument-detail-action-group" }, [
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-install",
            onclick: () => this.#callbacks.onUpdate(entry),
          }, ["Update"]),
          h("button", {
            class: "instrument-detail-btn instrument-detail-btn-danger",
            onclick: () => this.#callbacks.onUninstall(entry.id),
          }, ["Uninstall"]),
        ]);
      }

      return h("button", {
        class: "instrument-detail-btn instrument-detail-btn-danger",
        onclick: () => this.#callbacks.onUninstall(entry.id),
      }, ["Uninstall"]);
    }

    if (this.#installing) {
      return h("button", {
        class: "instrument-detail-btn instrument-detail-btn-install",
        disabled: true,
      }, ["Installing..."]);
    }
    return h("button", {
      class: "instrument-detail-btn instrument-detail-btn-install",
      onclick: () => this.#callbacks.onInstall(entry),
    }, ["Install"]);
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
    return instrumentIcon(icon, 32);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
