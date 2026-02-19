import { h, clearChildren } from "../lib/dom.ts";
import type { DiffFile, DiffLine } from "../../shared/types.ts";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-php";

/**
 * Diff content panel — renders all changed files.
 * Each file can be collapsed/expanded independently.
 */
export class DiffView {
  #el: HTMLElement;
  #toolbarEl: HTMLElement;
  #contentEl: HTMLElement;
  #files: DiffFile[] = [];
  #activeFile: string | null = null;
  #fileExpanded = new Map<string, boolean>();
  #viewMode: "unified" | "split" = "unified";

  constructor(container: HTMLElement) {
    this.#toolbarEl = h("div", { class: "dv-toolbar" }, [
      h("span", { class: "dv-file-label" }, [""]),
      h("span", { class: "dv-toolbar-spacer" }),
      h("button", {
        class: "dv-toggle active",
        dataset: { view: "unified" },
        onclick: () => this.#setViewMode("unified"),
      }, ["Unified"]),
      h("button", {
        class: "dv-toggle",
        dataset: { view: "split" },
        onclick: () => this.#setViewMode("split"),
      }, ["Split"]),
    ]);

    this.#contentEl = h("div", { class: "dv-content" });

    this.#el = h("div", { class: "diff-view" }, [
      this.#toolbarEl,
      this.#contentEl,
    ]);

    container.appendChild(this.#el);
  }

  setFiles(files: DiffFile[]): void {
    this.#files = files;
    const nextExpanded = new Map<string, boolean>();
    for (const file of files) {
      nextExpanded.set(file.path, this.#fileExpanded.get(file.path) ?? true);
    }
    this.#fileExpanded = nextExpanded;
    if (this.#activeFile && !files.some((f) => f.path === this.#activeFile)) {
      this.#activeFile = null;
    }
    this.#renderDiff();
  }

  showFile(path: string): void {
    this.#activeFile = path;
    this.#fileExpanded.set(path, true);
    this.#renderDiff();
    this.#scrollToFile(path);
  }

  clear(): void {
    this.#files = [];
    this.#activeFile = null;
    this.#fileExpanded.clear();
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (label) label.textContent = "";
    clearChildren(this.#contentEl);
    this.#contentEl.appendChild(
      h("div", { class: "dv-empty" }, ["No changes"])
    );
  }

  #renderDiff(): void {
    clearChildren(this.#contentEl);
    const label = this.#toolbarEl.querySelector(".dv-file-label");

    if (this.#files.length === 0) {
      if (label) label.textContent = "";
      this.#contentEl.appendChild(
        h("div", { class: "dv-empty" }, ["No changes"])
      );
      return;
    }

    if (label) {
      label.textContent = `${this.#files.length} file${this.#files.length !== 1 ? "s" : ""} changed`;
    }

    for (const file of this.#files) {
      this.#contentEl.appendChild(this.#renderFileSection(file));
    }

    if (this.#activeFile) {
      this.#scrollToFile(this.#activeFile);
    }
  }

  #renderFileSection(file: DiffFile): HTMLElement {
    const statusSymbol = {
      added: "+",
      deleted: "\u2212",
      modified: "\u2219",
      renamed: "R",
    }[file.status];
    const { adds, dels } = countFileChanges(file);
    const delta = [
      adds > 0 ? h("span", { class: "dv-delta-add" }, [`+${adds}`]) : null as any,
      dels > 0 ? h("span", { class: "dv-delta-del" }, [`-${dels}`]) : null as any,
    ].filter(Boolean) as HTMLElement[];

    const details = h("details", {
      class: `dv-file-section${file.path === this.#activeFile ? " active" : ""}`,
      dataset: { filePath: file.path },
    }) as HTMLDetailsElement;
    details.open = this.#fileExpanded.get(file.path) ?? true;
    details.addEventListener("toggle", () => {
      this.#fileExpanded.set(file.path, details.open);
    });

    details.appendChild(
      h("summary", { class: "dv-file-summary" }, [
        h("span", { class: `dv-file-status dv-file-status-${file.status}` }, [statusSymbol]),
        h("span", { class: "dv-file-main" }, [
          h("span", { class: "dv-file-path" }, [file.path]),
          delta.length > 0 ? h("span", { class: "dv-file-delta" }, delta) : null as any,
        ].filter(Boolean)),
        file.isBinary ? h("span", { class: "dv-file-binary" }, ["bin"]) : null as any,
      ].filter(Boolean))
    );

    const body = h("div", { class: "dv-file-body" });
    if (file.isBinary) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Binary file changed"]));
    } else if (file.hunks.length === 0) {
      body.appendChild(h("div", { class: "dv-file-empty" }, ["Empty diff"]));
    } else if (this.#viewMode === "unified") {
      body.appendChild(this.#buildUnifiedTable(file));
    } else {
      body.appendChild(this.#buildSplitTable(file));
    }

    details.appendChild(body);
    return details;
  }

  #buildUnifiedTable(file: DiffFile): HTMLElement {
    const table = h("table", { class: "diff-table unified" });

    for (const hunk of file.hunks) {
      table.appendChild(
        h("tr", { class: "diff-hunk-header" }, [
          h("td", { class: "line-no" }),
          h("td", { class: "line-content hunk-label" }, [hunk.header]),
        ])
      );

      for (const line of hunk.lines) {
        const lineClass = `diff-line diff-${line.type}`;
        const prefix = { add: "+", delete: "-", context: " " }[line.type];
        const lineNo = line.type === "add"
          ? line.newLineNo
          : line.type === "delete"
          ? line.oldLineNo
          : (line.newLineNo ?? line.oldLineNo);

        table.appendChild(
          h("tr", { class: lineClass }, [
            h("td", { class: "line-no" }, [
              lineNo != null ? String(lineNo) : "",
            ]),
            h("td", {
              class: "line-content",
              innerHTML: renderUnifiedLineContent(prefix, line.content, line.type, file.path),
            }),
          ])
        );
      }
    }

    return table;
  }

  #buildSplitTable(file: DiffFile): HTMLElement {
    const table = h("table", { class: "diff-table split" });

    for (const hunk of file.hunks) {
      table.appendChild(
        h("tr", { class: "diff-hunk-header" }, [
          h("td", { class: "line-no" }),
          h("td", { class: "line-content hunk-label" }),
          h("td", { class: "line-no" }),
          h("td", { class: "line-content hunk-label" }, [hunk.header]),
        ])
      );

      const pairs = pairLines(hunk.lines);

      for (const [left, right] of pairs) {
        const leftLineClass = left ? ` diff-${left.type}` : "";
        const rightLineClass = right ? ` diff-${right.type}` : "";
        table.appendChild(
          h("tr", { class: "diff-line" }, [
            h("td", { class: `line-no${leftLineClass}` }, [
              left?.oldLineNo != null ? String(left.oldLineNo) : "",
            ]),
            h("td", {
              class: `line-content${leftLineClass}`,
              innerHTML: left ? highlightCodeLine(left.content, file.path) : "",
            }),
            h("td", { class: `line-no${rightLineClass}` }, [
              right?.newLineNo != null ? String(right.newLineNo) : "",
            ]),
            h("td", {
              class: `line-content${rightLineClass}`,
              innerHTML: right ? highlightCodeLine(right.content, file.path) : "",
            }),
          ])
        );
      }
    }

    return table;
  }

  #setViewMode(mode: "unified" | "split"): void {
    this.#viewMode = mode;
    for (const btn of this.#toolbarEl.querySelectorAll("[data-view]")) {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.view === mode);
    }
    this.#renderDiff();
  }

  #scrollToFile(path: string): void {
    requestAnimationFrame(() => {
      const target = Array.from(
        this.#contentEl.querySelectorAll<HTMLElement>(".dv-file-section")
      ).find((el) => el.dataset.filePath === path);
      if (!target) return;
      target.scrollIntoView({ block: "nearest" });
    });
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function countFileChanges(file: DiffFile): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") adds++;
      if (line.type === "delete") dels++;
    }
  }
  return { adds, dels };
}

function pairLines(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  const result: [DiffLine | null, DiffLine | null][] = [];
  const deletes: DiffLine[] = [];
  const adds: DiffLine[] = [];

  const flush = () => {
    const max = Math.max(deletes.length, adds.length);
    for (let i = 0; i < max; i++) {
      result.push([deletes[i] ?? null, adds[i] ?? null]);
    }
    deletes.length = 0;
    adds.length = 0;
  };

  for (const line of lines) {
    if (line.type === "context") {
      flush();
      result.push([line, line]);
    } else if (line.type === "delete") {
      deletes.push(line);
    } else if (line.type === "add") {
      adds.push(line);
    }
  }

  flush();
  return result;
}

function renderUnifiedLineContent(
  prefix: string,
  content: string,
  type: DiffLine["type"],
  filePath: string
): string {
  const prefixClass =
    type === "add"
      ? "dv-diff-prefix-add"
      : type === "delete"
      ? "dv-diff-prefix-del"
      : "dv-diff-prefix-context";

  const safePrefix = escapeHtml(prefix);
  const highlighted = highlightCodeLine(content, filePath);
  return `<span class="dv-diff-prefix ${prefixClass}">${safePrefix}</span>${highlighted}`;
}

function highlightCodeLine(content: string, filePath: string): string {
  if (content.length > 8000) {
    return escapeHtml(content);
  }

  const language = languageFromFilePath(filePath);
  const grammar = language
    ? (Prism.languages as Record<string, Prism.Grammar>)[language] ?? null
    : null;

  if (!grammar || !language) {
    return escapeHtml(content);
  }

  try {
    return Prism.highlight(content, grammar, language);
  } catch {
    return escapeHtml(content);
  }
}

function languageFromFilePath(filePath: string): string | null {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "";

  const map: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    c: "c",
    h: "c",
    cc: "cpp",
    cxx: "cpp",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    py: "python",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    css: "css",
    sql: "sql",
    php: "php",
  };

  return map[ext] ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
