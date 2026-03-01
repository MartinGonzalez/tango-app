import { h } from "../lib/dom.ts";

export type DebugLogDirection = "host→instrument" | "instrument→host";

export interface DebugLogEntry {
  ts: number;
  dir: DebugLogDirection;
  namespace: string;
  method: string;
  args: unknown[];
  instrumentId?: string;
}

const MAX_ENTRIES = 500;

/**
 * Floating debug panel that shows bidirectional API traffic
 * between instruments and the Tango host. Toggle with Cmd+Opt+D.
 */
export class DebugLogPanel {
  private entries: DebugLogEntry[] = [];
  private el: HTMLElement;
  private listEl: HTMLElement;
  private filterInput: HTMLInputElement;
  private visible = false;
  private filter = "";
  private autoScroll = true;

  constructor(container: HTMLElement) {
    this.filterInput = document.createElement("input");
    this.filterInput.type = "text";
    this.filterInput.placeholder = "Filter (namespace, method, dir)…";
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
      h("span", { class: "debug-log-title" }, ["Instrument Debug"]),
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

  record(entry: DebugLogEntry): void {
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

  private filteredEntries(): DebugLogEntry[] {
    if (!this.filter) return this.entries;
    return this.entries.filter((e) => {
      const haystack = `${e.dir} ${e.namespace} ${e.method} ${e.instrumentId ?? ""}`.toLowerCase();
      return haystack.includes(this.filter);
    });
  }

  private appendRow(entry: DebugLogEntry): void {
    if (this.filter) {
      const haystack = `${entry.dir} ${entry.namespace} ${entry.method} ${entry.instrumentId ?? ""}`.toLowerCase();
      if (!haystack.includes(this.filter)) return;
    }

    const time = new Date(entry.ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);

    const dirClass = entry.dir === "host→instrument" ? "dir-host" : "dir-instrument";
    const dirLabel = entry.dir === "host→instrument" ? "H→I" : "I→H";

    let argsPreview: string;
    let argsFull: string;
    try {
      argsFull = JSON.stringify(entry.args, null, 2);
      argsPreview = argsFull.length > 120 ? JSON.stringify(entry.args).slice(0, 120) + "…" : argsFull.replace(/\n/g, " ");
    } catch {
      argsPreview = "[unserializable]";
      argsFull = argsPreview;
    }

    const detail = h("pre", { class: "debug-log-detail" }, [argsFull]);

    const summary = h("div", { class: "debug-log-summary" }, [
      h("span", { class: "debug-log-time" }, [time]),
      h("span", { class: `debug-log-dir ${dirClass}` }, [dirLabel]),
      h("span", { class: "debug-log-ns" }, [entry.namespace]),
      h("span", { class: "debug-log-method" }, [`.${entry.method}()`]),
      h("span", { class: "debug-log-args" }, [argsPreview]),
    ]);

    const row = h("div", { class: "debug-log-row" }, [summary, detail]);
    summary.addEventListener("click", () => {
      row.classList.toggle("expanded");
    });

    this.listEl.appendChild(row);

    if (this.autoScroll) {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    }
  }
}
