import { clearChildren, h } from "../lib/dom.ts";
import { instrumentIcon } from "../lib/icons.ts";
import type {
  InstrumentRegistryEntry,
  InstrumentSettingField,
} from "../../shared/types.ts";

export type InstrumentsSidebarCallbacks = {
  onActivate: (instrumentId: string) => void;
  onBack: () => void;
  onAddLocal: () => void;
  onToggleEnabled: (instrumentId: string, enabled: boolean) => void;
  onRemoveLocal: (instrumentId: string) => void;
  onLoadSettings: (instrumentId: string) => Promise<{
    schema: InstrumentSettingField[];
    values: Record<string, unknown>;
  }>;
  onSetSettingValue: (
    instrumentId: string,
    key: string,
    value: unknown
  ) => Promise<Record<string, unknown>>;
};

type InstrumentSettingsState = {
  loaded: boolean;
  loading: boolean;
  schema: InstrumentSettingField[];
  values: Record<string, unknown>;
  error: string | null;
  savingKeys: Set<string>;
};

export class InstrumentsSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: InstrumentsSidebarCallbacks;
  #entries: InstrumentRegistryEntry[] = [];
  #activeId: string | null = null;
  #loading = false;
  #error: string | null = null;
  #settingsByInstrument = new Map<string, InstrumentSettingsState>();

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

    this.#listEl = h("div", { class: "tasks-sidebar-list instruments-list" });

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
    if (instrumentId) {
      void this.#ensureSettingsLoaded(instrumentId);
    }
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

    const displayName = entry.devMode ? `${entry.name} [dev]` : entry.name;
    const sourceLabel = entry.devMode
      ? "Local"
      : entry.isBundled
        ? "Core"
        : "Community";
    const badgeClass = entry.devMode
      ? "instrument-badge instrument-badge-local"
      : entry.isBundled
        ? "instrument-badge instrument-badge-core"
        : "instrument-badge instrument-badge-community";

    const row = h("div", {
      class: `task-group${active ? " active" : ""}`,
    }, [
      h("button", {
        class: `task-row${active ? " active" : ""}`,
        title: `${entry.name} (${entry.id})`,
        onclick: () => this.#callbacks.onActivate(entry.id),
      }, [
        instrumentIcon(entry.launcher?.sidebarShortcut?.icon ?? "puzzle", 16),
        h("span", { class: "task-row-title" }, [displayName]),
        h("div", { class: "task-row-meta" }, [
          h("span", { class: badgeClass }, [sourceLabel]),
        ]),
      ]),
      h("div", { class: "task-group-list" }, [
        entry.lastError
          ? h("div", { class: "tasks-banner tasks-banner-error" }, [entry.lastError])
          : h("div", { hidden: true }),
      ]),
    ]);

    return row;
  }

  #getOrCreateSettingsState(instrumentId: string): InstrumentSettingsState {
    const existing = this.#settingsByInstrument.get(instrumentId);
    if (existing) return existing;
    const created: InstrumentSettingsState = {
      loaded: false,
      loading: false,
      schema: [],
      values: {},
      error: null,
      savingKeys: new Set(),
    };
    this.#settingsByInstrument.set(instrumentId, created);
    return created;
  }

  async #ensureSettingsLoaded(instrumentId: string): Promise<void> {
    const state = this.#getOrCreateSettingsState(instrumentId);
    if (state.loading) return;
    if (state.loaded) return;
    state.loading = true;
    state.error = null;
    this.#renderContent();
    try {
      const loaded = await this.#callbacks.onLoadSettings(instrumentId);
      state.schema = loaded.schema;
      state.values = loaded.values;
      state.error = null;
      state.loaded = true;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      state.loaded = true;
    } finally {
      state.loading = false;
      this.#renderContent();
    }
  }

  async #saveSettingValue(
    instrumentId: string,
    key: string,
    value: unknown
  ): Promise<void> {
    const state = this.#getOrCreateSettingsState(instrumentId);
    state.savingKeys.add(key);
    state.error = null;
    this.#renderContent();
    try {
      const values = await this.#callbacks.onSetSettingValue(instrumentId, key, value);
      state.values = values;
      state.error = null;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    } finally {
      state.savingKeys.delete(key);
      this.#renderContent();
    }
  }

  #renderSettings(entry: InstrumentRegistryEntry): HTMLElement {
    const state = this.#getOrCreateSettingsState(entry.id);
    const container = h("div", { class: "instrument-settings" });

    if (state.loading) {
      container.appendChild(h("div", { class: "task-group-empty" }, ["Loading settings..."]));
      return container;
    }

    if (state.error) {
      container.appendChild(h("div", { class: "tasks-banner tasks-banner-error" }, [state.error]));
    }

    const schema = state.schema.length > 0 ? state.schema : entry.settings;
    if (!schema.length) {
      return h("div", { hidden: true });
    }

    for (const field of schema) {
      const value = state.values[field.key];
      const row = h("div", { class: "instrument-setting-row" });
      const label = h("div", { class: "instrument-setting-head" }, [
        h("span", { class: "instrument-setting-title" }, [field.title]),
        field.required
          ? h("span", { class: "instrument-setting-required" }, ["Required"])
          : h("span", { hidden: true }),
      ]);
      const description = field.description
        ? h("div", { class: "instrument-setting-description" }, [field.description])
        : h("div", { hidden: true });

      const control = this.#renderSettingControl(entry.id, field, value, state.savingKeys.has(field.key));
      row.append(label, description, control);
      container.appendChild(row);
    }

    return container;
  }

  #renderSettingControl(
    instrumentId: string,
    field: InstrumentSettingField,
    value: unknown,
    saving: boolean
  ): HTMLElement {
    if (field.type === "boolean") {
      const checkbox = h("input", {
        type: "checkbox",
        checked: Boolean(value),
        onchange: (event: Event) => {
          const target = event.currentTarget as HTMLInputElement | null;
          void this.#saveSettingValue(instrumentId, field.key, Boolean(target?.checked));
        },
      }) as HTMLInputElement;
      checkbox.disabled = saving;
      return h("label", { class: "instrument-setting-checkbox" }, [
        checkbox,
        h("span", {}, [field.title]),
      ]);
    }

    if (field.type === "select") {
      const select = h("select", {
        class: "tasks-input",
      }) as HTMLSelectElement;
      for (const option of field.options) {
        select.appendChild(h("option", {
          value: option.value,
        }, [option.label]));
      }
      select.value = String(value ?? field.default ?? field.options[0]?.value ?? "");
      select.disabled = saving;
      select.addEventListener("change", () => {
        void this.#saveSettingValue(instrumentId, field.key, select.value);
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
        void this.#saveSettingValue(instrumentId, field.key, nextValue);
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
