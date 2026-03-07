import { clearChildren, h } from "../lib/dom.ts";
import type {
  InstrumentCatalogEntry,
  InstrumentCategory,
} from "../../shared/types.ts";

export type InstrumentBrowseCallbacks = {
  onSelect: (entry: InstrumentCatalogEntry) => void;
  onRefresh: () => void;
};

const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  "developer-tools": "Developer Tools",
  "productivity": "Productivity",
  "media": "Media",
  "communication": "Communication",
  "finance": "Finance",
  "utilities": "Utilities",
};

const ALL_CATEGORIES: InstrumentCategory[] = [
  "developer-tools",
  "productivity",
  "media",
  "communication",
  "finance",
  "utilities",
];

export class InstrumentBrowsePanel {
  #el: HTMLElement;
  #headerEl: HTMLElement;
  #listEl: HTMLElement;
  #searchInput: HTMLInputElement;
  #callbacks: InstrumentBrowseCallbacks;
  #entries: InstrumentCatalogEntry[] = [];
  #loading = false;
  #error: string | null = null;
  #searchQuery = "";
  #activeCategory: InstrumentCategory | null = null;
  #selectedId: string | null = null;

  constructor(callbacks: InstrumentBrowseCallbacks) {
    this.#callbacks = callbacks;

    this.#searchInput = h("input", {
      class: "tasks-input instrument-browse-search",
      type: "text",
      placeholder: "Search instruments...",
    }) as HTMLInputElement;
    this.#searchInput.addEventListener("input", () => {
      this.#searchQuery = this.#searchInput.value.trim().toLowerCase();
      this.#renderList();
    });

    const refreshBtn = h("button", {
      class: "tasks-sidebar-back-btn",
      title: "Refresh catalog",
      onclick: () => this.#callbacks.onRefresh(),
    }, ["\u21BB"]);

    this.#headerEl = h("div", { class: "instrument-browse-header" }, [
      h("div", { class: "instrument-browse-title-row" }, [
        h("span", { class: "instrument-browse-title" }, ["Browse Instruments"]),
        refreshBtn,
      ]),
      this.#searchInput,
      this.#renderCategoryFilters(),
    ]);

    this.#listEl = h("div", { class: "instrument-browse-list" });

    this.#el = h("div", { class: "instrument-browse-panel" }, [
      this.#headerEl,
      this.#listEl,
    ]);
  }

  render(
    entries: InstrumentCatalogEntry[],
    opts?: { loading?: boolean; error?: string | null },
  ): void {
    this.#entries = entries;
    this.#loading = Boolean(opts?.loading);
    this.#error = opts?.error ?? null;
    this.#renderList();
  }

  #renderCategoryFilters(): HTMLElement {
    const container = h("div", { class: "instrument-browse-filters" });

    const allBtn = h("button", {
      class: `instrument-browse-filter-btn${this.#activeCategory === null ? " active" : ""}`,
      onclick: () => {
        this.#activeCategory = null;
        this.#rebuildFilters();
        this.#renderList();
      },
    }, ["All"]);
    container.appendChild(allBtn);

    for (const cat of ALL_CATEGORIES) {
      const btn = h("button", {
        class: `instrument-browse-filter-btn${this.#activeCategory === cat ? " active" : ""}`,
        onclick: () => {
          this.#activeCategory = this.#activeCategory === cat ? null : cat;
          this.#rebuildFilters();
          this.#renderList();
        },
      }, [CATEGORY_LABELS[cat]]);
      container.appendChild(btn);
    }

    return container;
  }

  #rebuildFilters(): void {
    const filtersHost = this.#headerEl.querySelector(".instrument-browse-filters");
    if (filtersHost) {
      const newFilters = this.#renderCategoryFilters();
      filtersHost.replaceWith(newFilters);
    }
  }

  #filteredEntries(): InstrumentCatalogEntry[] {
    let filtered = this.#entries;

    if (this.#activeCategory) {
      filtered = filtered.filter((e) => e.category === this.#activeCategory);
    }

    if (this.#searchQuery) {
      filtered = filtered.filter((e) =>
        e.name.toLowerCase().includes(this.#searchQuery)
        || e.id.toLowerCase().includes(this.#searchQuery)
        || (e.description?.toLowerCase().includes(this.#searchQuery) ?? false),
      );
    }

    return filtered;
  }

  #renderList(): void {
    clearChildren(this.#listEl);

    if (this.#loading) {
      this.#listEl.appendChild(
        h("div", { class: "instrument-browse-empty" }, ["Loading catalog..."]),
      );
      return;
    }

    if (this.#error) {
      this.#listEl.appendChild(
        h("div", { class: "tasks-banner tasks-banner-error" }, [this.#error]),
      );
    }

    const filtered = this.#filteredEntries();

    if (filtered.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "instrument-browse-empty" }, [
          this.#entries.length === 0
            ? "No instruments available"
            : "No instruments match your search",
        ]),
      );
      return;
    }

    for (const entry of filtered) {
      this.#listEl.appendChild(this.#renderEntry(entry));
    }
  }

  #renderEntry(entry: InstrumentCatalogEntry): HTMLElement {
    const isSelected = entry.id === this.#selectedId;
    const icon = entry.icon ?? "puzzle";
    const category = entry.category
      ? CATEGORY_LABELS[entry.category] ?? entry.category
      : "";

    const row = h("button", {
      class: `instrument-browse-item${isSelected ? " active" : ""}`,
      onclick: () => {
        this.#selectedId = entry.id;
        this.#callbacks.onSelect(entry);
        this.#renderList();
      },
    }, [
      h("div", { class: "instrument-browse-item-icon" }, [icon]),
      h("div", { class: "instrument-browse-item-info" }, [
        h("div", { class: "instrument-browse-item-name" }, [entry.name]),
        entry.description
          ? h("div", { class: "instrument-browse-item-desc" }, [entry.description])
          : h("div", { hidden: true }),
        h("div", { class: "instrument-browse-item-meta" }, [
          category ? h("span", { class: "instrument-detail-tag" }, [category]) : h("span", { hidden: true }),
          entry.author ? h("span", { class: "instrument-browse-item-author" }, [entry.author]) : h("span", { hidden: true }),
          entry.installed ? h("span", { class: "instrument-browse-item-installed" }, ["Installed"]) : h("span", { hidden: true }),
        ]),
      ]),
    ]);

    return row;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
