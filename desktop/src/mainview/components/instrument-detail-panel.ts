import { clearChildren, h } from "../lib/dom.ts";
import { instrumentIcon } from "../lib/icons.ts";
import { compareSemver } from "../../shared/version.ts";
import type {
  InstrumentRegistryEntry,
  InstrumentCatalogEntry,
  InstrumentCategory,
  InstrumentSettingField,
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
  onLoadSettings: (instrumentId: string) => Promise<{
    schema: InstrumentSettingField[];
    values: Record<string, unknown>;
  }>;
  onSetSettingValue: (
    instrumentId: string,
    key: string,
    value: unknown,
  ) => Promise<Record<string, unknown>>;
};

const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  "developer-tools": "Developer Tools",
  "productivity": "Productivity",
  "media": "Media",
  "communication": "Communication",
  "finance": "Finance",
  "utilities": "Utilities",
};

type SettingsState = {
  loading: boolean;
  schema: InstrumentSettingField[];
  values: Record<string, unknown>;
  savingKeys: Set<string>;
  error: string | null;
};

export class InstrumentDetailPanel {
  #el: HTMLElement;
  #contentEl: HTMLElement;
  #callbacks: InstrumentDetailCallbacks;
  #target: DetailTarget = null;
  #installing = false;
  #updating = false;
  #justUpdated = false;
  #settings: SettingsState = {
    loading: false,
    schema: [],
    values: {},
    savingKeys: new Set(),
    error: null,
  };

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
    this.#settings = { loading: false, schema: [], values: {}, savingKeys: new Set(), error: null };
    this.#render();
    if (entry.settings.length > 0) {
      void this.#loadSettings(entry.id);
    }
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
      // Settings (only for installed instruments with settings)
      ...(isInstalled && (entry as InstrumentRegistryEntry).settings.length > 0
        ? [
            h("hr", { class: "instrument-detail-divider" }),
            this.#renderSettingsSection(entry as InstrumentRegistryEntry),
          ]
        : []),
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

  async #loadSettings(instrumentId: string): Promise<void> {
    this.#settings.loading = true;
    this.#render();
    try {
      const result = await this.#callbacks.onLoadSettings(instrumentId);
      this.#settings.schema = result.schema;
      this.#settings.values = result.values;
      this.#settings.error = null;
    } catch (err) {
      this.#settings.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.#settings.loading = false;
      this.#render();
    }
  }

  async #saveSetting(instrumentId: string, key: string, value: unknown): Promise<void> {
    this.#settings.savingKeys.add(key);
    this.#settings.error = null;
    this.#render();
    try {
      const values = await this.#callbacks.onSetSettingValue(instrumentId, key, value);
      this.#settings.values = values;
    } catch (err) {
      this.#settings.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.#settings.savingKeys.delete(key);
      this.#render();
    }
  }

  #renderSettingsSection(entry: InstrumentRegistryEntry): HTMLElement {
    const schema = this.#settings.schema.length > 0 ? this.#settings.schema : entry.settings;
    if (!schema.length) return h("div", { hidden: true });

    const container = h("div", { class: "instrument-detail-section" }, [
      h("h3", { class: "instrument-detail-section-title" }, ["Preferences"]),
    ]);

    if (this.#settings.loading) {
      container.appendChild(h("span", { class: "instrument-detail-muted" }, ["Loading..."]));
      return container;
    }

    if (this.#settings.error) {
      container.appendChild(h("div", { class: "tasks-banner tasks-banner-error" }, [this.#settings.error]));
    }

    for (const field of schema) {
      const value = this.#settings.values[field.key];
      const saving = this.#settings.savingKeys.has(field.key);
      container.appendChild(this.#renderSettingField(entry.id, field, value, saving));
    }

    return container;
  }

  #renderSettingField(
    instrumentId: string,
    field: InstrumentSettingField,
    value: unknown,
    saving: boolean,
  ): HTMLElement {
    const row = h("div", { class: "instrument-setting-row" });

    const head = h("div", { class: "instrument-setting-head" }, [
      h("span", { class: "instrument-setting-title" }, [field.title]),
      field.required
        ? h("span", { class: "instrument-setting-required" }, ["Required"])
        : h("span", { hidden: true }),
    ]);

    const description = field.description
      ? h("div", { class: "instrument-setting-description" }, [field.description])
      : h("div", { hidden: true });

    const control = this.#renderSettingControl(instrumentId, field, value, saving);
    row.append(head, description, control);
    return row;
  }

  #renderSettingControl(
    instrumentId: string,
    field: InstrumentSettingField,
    value: unknown,
    saving: boolean,
  ): HTMLElement {
    if (field.type === "boolean") {
      const checkbox = h("input", {
        type: "checkbox",
        checked: Boolean(value),
        onchange: (event: Event) => {
          const target = event.currentTarget as HTMLInputElement | null;
          void this.#saveSetting(instrumentId, field.key, Boolean(target?.checked));
        },
      }) as HTMLInputElement;
      checkbox.disabled = saving;
      return h("label", { class: "instrument-setting-checkbox" }, [
        checkbox,
        h("span", {}, [field.title]),
      ]);
    }

    if (field.type === "select") {
      const select = h("select", { class: "tasks-input" }) as HTMLSelectElement;
      for (const option of field.options) {
        select.appendChild(h("option", { value: option.value }, [option.label]));
      }
      select.value = String(value ?? field.default ?? field.options[0]?.value ?? "");
      select.disabled = saving;
      select.addEventListener("change", () => {
        void this.#saveSetting(instrumentId, field.key, select.value);
      });
      return select;
    }

    const inputType = field.secret ? "password" : field.type === "number" ? "number" : "text";
    const input = h("input", {
      class: "tasks-input",
      type: inputType,
      placeholder: field.type === "string" ? (field.placeholder ?? "") : "",
      value: value == null
        ? (field.default == null ? "" : String(field.default))
        : String(value),
    }) as HTMLInputElement;
    input.disabled = saving;

    const saveButton = h("button", {
      class: "plugins-content-btn",
      type: "button",
      disabled: saving,
      onclick: () => {
        const raw = input.value.trim();
        const nextValue = field.type === "number"
          ? (raw === "" ? null : Number(raw))
          : raw;
        void this.#saveSetting(instrumentId, field.key, nextValue);
      },
    }, [saving ? "Saving..." : "Save"]) as HTMLButtonElement;
    saveButton.disabled = saving;

    return h("div", { class: "instrument-setting-input-row" }, [
      input,
      saveButton,
    ]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
