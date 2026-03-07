import { h } from "../lib/dom.ts";

export type LogLevel = "error" | "warn" | "info" | "event" | "debug";

export type LogSource =
  | { kind: "instrument"; instrumentId: string }
  | { kind: "host" };

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  detail?: unknown;
}

const MAX_ENTRIES = 500;

/**
 * Floating log console that shows instrument logs, events, and API traffic.
 * Toggle with Cmd+L.
 */
export class DebugLogPanel {
  private entries: LogEntry[] = [];
  private el: HTMLElement;
  private listEl: HTMLElement;
  private filterInput: HTMLInputElement;
  private visible = false;
  private filter = "";
  private autoScroll = true;

  constructor(container: HTMLElement) {
    this.filterInput = document.createElement("input");
    this.filterInput.type = "text";
    this.filterInput.placeholder = "Filter (level, source, message)…";
    this.filterInput.className = "debug-log-filter";
    this.filterInput.addEventListener("input", () => {
      this.filter = this.filterInput.value.toLowerCase();
      this.render();
    });

    const clearBtn = h("button", {
      class: "debug-log-clear-btn",
      onclick: () => this.clear(),
    }, ["Clear"]);

    const header = h("div", { class: "debug-log-header" }, [
      h("span", { class: "debug-log-title" }, ["Console"]),
      clearBtn,
    ]);

    this.listEl = h("div", { class: "debug-log-list" });
    this.listEl.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.listEl;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 40;
    });

    this.el = h("div", { class: "debug-log-panel" }, [
      header,
      this.filterInput,
      this.listEl,
    ]);

    container.appendChild(this.el);
  }

  record(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
    if (this.visible) {
      this.appendRow(entry);
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle("visible", this.visible);
    if (this.visible) {
      this.render();
      this.filterInput.focus();
    }
  }

  clear(): void {
    this.entries = [];
    this.listEl.replaceChildren();
  }

  private render(): void {
    this.listEl.replaceChildren();
    const filtered = this.filteredEntries();
    for (const entry of filtered) {
      this.appendRow(entry);
    }
  }

  private filteredEntries(): LogEntry[] {
    if (!this.filter) return this.entries;
    return this.entries.filter((e) => {
      const sourceLabel = e.source.kind === "instrument" ? e.source.instrumentId : "host";
      const haystack = `${e.level} ${sourceLabel} ${e.message}`.toLowerCase();
      return haystack.includes(this.filter);
    });
  }

  private appendRow(entry: LogEntry): void {
    if (this.filter) {
      const sourceLabel = entry.source.kind === "instrument" ? entry.source.instrumentId : "host";
      const haystack = `${entry.level} ${sourceLabel} ${entry.message}`.toLowerCase();
      if (!haystack.includes(this.filter)) return;
    }

    const time = new Date(entry.ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);

    const sourceLabel = entry.source.kind === "instrument"
      ? `i:${entry.source.instrumentId}`
      : "host";

    const summaryChildren: (string | HTMLElement)[] = [
      h("span", { class: "debug-log-time" }, [time]),
      h("span", { class: `debug-log-level debug-log-level-${entry.level}` }, [`[${entry.level}]`]),
      h("span", { class: "debug-log-source" }, [`[${sourceLabel}]`]),
      h("span", { class: "debug-log-message" }, [entry.message]),
    ];

    const summary = h("div", { class: "debug-log-summary" }, summaryChildren);

    let detail: HTMLElement | null = null;
    if (entry.detail !== undefined) {
      let detailText: string;
      try {
        detailText = JSON.stringify(entry.detail, null, 2);
      } catch {
        detailText = "[unserializable]";
      }
      detail = h("pre", { class: "debug-log-detail" }, [detailText]);
    }

    const rowChildren: (string | HTMLElement)[] = [summary];
    if (detail) rowChildren.push(detail);

    const row = h("div", { class: "debug-log-row" }, rowChildren);
    if (detail) {
      summary.addEventListener("click", () => {
        row.classList.toggle("expanded");
      });
    }

    this.listEl.appendChild(row);

    if (this.autoScroll) {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    }
  }
}
