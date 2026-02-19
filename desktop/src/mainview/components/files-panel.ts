import { h, clearChildren } from "../lib/dom.ts";
import type { DiffFile, DiffScope } from "../../shared/types.ts";

export type FilesPanelCallbacks = {
  onSelectFile: (path: string) => void;
  onScopeChange: (scope: DiffScope) => void;
};

export class FilesPanel {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #countEl: HTMLElement;
  #callbacks: FilesPanelCallbacks;
  #activeFile: string | null = null;
  #files: DiffFile[] = [];
  #scope: DiffScope = "last_turn";
  #scopeLastBtn: HTMLButtonElement;
  #scopeAllBtn: HTMLButtonElement;

  constructor(container: HTMLElement, callbacks: FilesPanelCallbacks) {
    this.#callbacks = callbacks;

    this.#countEl = h("span", { class: "fp-count" }, ["0"]);
    this.#scopeLastBtn = h("button", {
      class: "fp-scope-btn active",
      onclick: () => this.setScope("last_turn", true),
    }, ["Last turn"]) as HTMLButtonElement;
    this.#scopeAllBtn = h("button", {
      class: "fp-scope-btn",
      onclick: () => this.setScope("all", true),
    }, ["All"]) as HTMLButtonElement;

    const header = h("div", { class: "fp-header" }, [
      h("div", { class: "fp-header-left" }, [
        h("span", { class: "fp-title" }, ["Files Changed"]),
        this.#countEl,
      ]),
      h("div", { class: "fp-scope-toggle" }, [
        this.#scopeLastBtn,
        this.#scopeAllBtn,
      ]),
    ]);

    this.#listEl = h("div", { class: "fp-list" });

    this.#el = h("div", { class: "files-panel" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(files: DiffFile[]): void {
    this.#files = files;
    this.#countEl.textContent = String(files.length);
    clearChildren(this.#listEl);

    if (files.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "fp-empty" }, [
          this.#scope === "last_turn"
            ? "No changes in last turn"
            : "No changes",
        ])
      );
      return;
    }

    for (const file of files) {
      this.#listEl.appendChild(this.#renderFile(file));
    }
  }

  setActiveFile(path: string | null): void {
    this.#activeFile = path;
    for (const item of this.#listEl.querySelectorAll(".fp-file-item")) {
      (item as HTMLElement).classList.toggle(
        "active",
        (item as HTMLElement).dataset.filePath === path
      );
    }
  }

  clear(): void {
    this.#files = [];
    this.#activeFile = null;
    this.#countEl.textContent = "0";
    clearChildren(this.#listEl);
    this.#listEl.appendChild(
      h("div", { class: "fp-empty" }, [
        this.#scope === "last_turn"
          ? "No changes in last turn"
          : "No changes",
      ])
    );
  }

  setScope(scope: DiffScope, notify = false): void {
    this.#scope = scope;
    this.#scopeLastBtn.classList.toggle("active", scope === "last_turn");
    this.#scopeAllBtn.classList.toggle("active", scope === "all");
    if (notify) {
      this.#callbacks.onScopeChange(scope);
    }
  }

  #renderFile(file: DiffFile): HTMLElement {
    const statusIcon = { added: "+", deleted: "\u2212", modified: "\u2219", renamed: "R" }[file.status];
    const statusClass = `fp-status-${file.status}`;
    const fileName = file.path.split("/").pop() ?? file.path;
    const dirPath = file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : "";
    const { adds, dels } = countFileChanges(file);

    return h(
      "div",
      {
        class: `fp-file-item${file.path === this.#activeFile ? " active" : ""}`,
        dataset: { filePath: file.path },
        onclick: () => {
          this.setActiveFile(file.path);
          this.#callbacks.onSelectFile(file.path);
        },
      },
      [
        h("span", { class: `fp-status ${statusClass}` }, [statusIcon]),
        h("div", { class: "fp-file-info" }, [
          h("span", { class: "fp-file-name" }, [fileName]),
          dirPath
            ? h("span", { class: "fp-file-dir" }, [dirPath])
            : null as any,
        ].filter(Boolean)),
        h("span", { class: "fp-file-delta" }, [
          adds > 0 ? h("span", { class: "fp-delta-add" }, [`+${adds}`]) : null as any,
          dels > 0 ? h("span", { class: "fp-delta-del" }, [`-${dels}`]) : null as any,
        ].filter(Boolean)),
        file.isBinary ? h("span", { class: "fp-binary-tag" }, ["bin"]) : null as any,
      ].filter(Boolean)
    );
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
