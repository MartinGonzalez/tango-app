import { h } from "../lib/dom.ts";
type PullRequestFileReviewState = { seen: boolean; attention: "new" | "updated" | null };
import type { DiffFile, DiffScope } from "../../shared/types.ts";

export type FileListView = "flat" | "tree";

export type FilesPanelCallbacks = {
  onSelectFile: (path: string) => void;
  onScopeChange: (scope: DiffScope) => void;
  onToggleFileSeen?: (path: string, seen: boolean) => void;
  onViewModeChange?: (mode: FileListView) => void;
};

type FileTreeNode = {
  name: string;
  path: string;
  dirs: Map<string, FileTreeNode>;
  files: DiffFile[];
};

export class FilesPanel {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #countEl: HTMLElement;
  #callbacks: FilesPanelCallbacks;
  #activeFile: string | null = null;
  #files: DiffFile[] = [];
  #fileItemEls = new Map<string, HTMLElement>();
  #scope: DiffScope = "last_turn";
  #scopeLastBtn: HTMLButtonElement;
  #scopeAllBtn: HTMLButtonElement;
  #scopeToggleEl: HTMLElement;
  #viewMode: FileListView = "flat";
  #viewFlatBtn: HTMLButtonElement;
  #viewTreeBtn: HTMLButtonElement;
  #viewToggleEl: HTMLElement;
  #reviewMode = false;
  #fileReviewState = new Map<string, PullRequestFileReviewState>();
  #treeExpanded = new Map<string, boolean>();

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

    this.#scopeToggleEl = h("div", { class: "fp-scope-toggle" }, [
      this.#scopeLastBtn,
      this.#scopeAllBtn,
    ]);

    this.#viewFlatBtn = h("button", {
      class: "fp-view-btn active",
      onclick: () => this.setViewMode("flat", true),
    }, ["Flat"]) as HTMLButtonElement;
    this.#viewTreeBtn = h("button", {
      class: "fp-view-btn",
      onclick: () => this.setViewMode("tree", true),
    }, ["Tree"]) as HTMLButtonElement;

    this.#viewToggleEl = h("div", { class: "fp-view-toggle" }, [
      this.#viewFlatBtn,
      this.#viewTreeBtn,
    ]);

    const headerControls = h("div", { class: "fp-header-controls" }, [
      this.#viewToggleEl,
      this.#scopeToggleEl,
    ]);

    const header = h("div", { class: "fp-header" }, [
      h("div", { class: "fp-header-left" }, [
        h("span", { class: "fp-title" }, ["Files Changed"]),
        this.#countEl,
      ]),
      headerControls,
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
    this.#renderCurrentFiles();
  }

  #renderCurrentFiles(): void {
    const files = this.#files;
    this.#countEl.textContent = String(files.length);
    this.#fileItemEls.clear();
    if (this.#activeFile && !files.some((file) => file.path === this.#activeFile)) {
      this.#activeFile = null;
    }

    if (files.length === 0) {
      this.#treeExpanded.clear();
      this.#listEl.replaceChildren(
        h("div", { class: "fp-empty" }, [
          this.#reviewMode
            ? "No files changed"
            : this.#scope === "last_turn"
            ? "No changes in last turn"
            : "No changes",
        ])
      );
      return;
    }

    if (this.#viewMode === "tree") {
      this.#renderTreeFiles(files);
      return;
    }

    this.#renderFlatFiles(files);
  }

  #renderFlatFiles(files: DiffFile[]): void {
    const fragment = document.createDocumentFragment();
    for (const file of files) {
      fragment.appendChild(this.#renderFile(file, { depth: 0, showDir: true, treeMode: false }));
    }
    this.#listEl.replaceChildren(fragment);
  }

  #renderTreeFiles(files: DiffFile[]): void {
    const root = buildFileTree(files);
    const validDirs = new Set<string>();
    collectTreePaths(root, validDirs);
    for (const path of this.#treeExpanded.keys()) {
      if (!validDirs.has(path)) {
        this.#treeExpanded.delete(path);
      }
    }
    if (this.#activeFile) {
      this.#expandFileParents(this.#activeFile);
    }

    const fragment = document.createDocumentFragment();
    this.#appendTreeRows(root, fragment, 0);
    this.#listEl.replaceChildren(fragment);
  }

  #appendTreeRows(node: FileTreeNode, parent: DocumentFragment | HTMLElement, depth: number): void {
    const directories = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));

    for (const dir of directories) {
      const isOpen = this.#isFolderOpen(dir.path, depth);
      parent.appendChild(this.#renderFolder(dir, depth, isOpen));
      if (isOpen) {
        this.#appendTreeRows(dir, parent, depth + 1);
      }
    }

    for (const file of files) {
      parent.appendChild(this.#renderFile(file, { depth, showDir: false, treeMode: true }));
    }
  }

  #renderFolder(node: FileTreeNode, depth: number, isOpen: boolean): HTMLElement {
    const fileCount = countTreeFiles(node);
    const paddingLeft = 10 + (depth * 14);
    return h("button", {
      class: `fp-folder-row${isOpen ? " open" : ""}`,
      type: "button",
      style: {
        paddingLeft: `${paddingLeft}px`,
      },
      title: node.path,
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#treeExpanded.set(node.path, !isOpen);
        this.#renderCurrentFiles();
      },
    }, [
      h("span", { class: "fp-folder-caret", "aria-hidden": "true" }, ["\u25B8"]),
      h("span", { class: "fp-folder-name" }, [node.name]),
      h("span", { class: "fp-folder-count" }, [String(fileCount)]),
    ]);
  }

  #isFolderOpen(path: string, depth: number): boolean {
    const current = this.#treeExpanded.get(path);
    if (current != null) return current;
    const defaultOpen = depth === 0;
    this.#treeExpanded.set(path, defaultOpen);
    return defaultOpen;
  }

  #expandFileParents(path: string): boolean {
    const segments = path.split("/");
    if (segments.length <= 1) return false;

    let changed = false;
    let current = "";
    for (let i = 0; i < segments.length - 1; i++) {
      current = current ? `${current}/${segments[i]}` : segments[i];
      if (this.#treeExpanded.get(current) !== true) {
        this.#treeExpanded.set(current, true);
        changed = true;
      }
    }
    return changed;
  }

  setActiveFile(path: string | null): void {
    const previous = this.#activeFile;
    this.#activeFile = path;

    if (path && this.#viewMode === "tree") {
      const expandedParents = this.#expandFileParents(path);
      const targetVisible = this.#fileItemEls.has(path);
      if (expandedParents || !targetVisible) {
        this.#renderCurrentFiles();
        return;
      }
    }

    if (previous && previous !== path) {
      this.#fileItemEls.get(previous)?.classList.remove("active");
    }
    if (path) {
      this.#fileItemEls.get(path)?.classList.add("active");
    }
  }

  clear(): void {
    this.#files = [];
    this.#activeFile = null;
    this.#fileItemEls.clear();
    this.#fileReviewState.clear();
    this.#treeExpanded.clear();
    this.#countEl.textContent = "0";
    this.#listEl.replaceChildren(
      h("div", { class: "fp-empty" }, [
        this.#reviewMode
          ? "No files changed"
          : this.#scope === "last_turn"
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

  setReviewMode(enabled: boolean): void {
    this.#reviewMode = enabled;
    this.#scopeToggleEl.hidden = enabled;
    this.#renderCurrentFiles();
  }

  setViewMode(mode: FileListView, notify = false): void {
    if (this.#viewMode === mode) return;
    this.#viewMode = mode;
    this.#viewFlatBtn.classList.toggle("active", mode === "flat");
    this.#viewTreeBtn.classList.toggle("active", mode === "tree");
    if (mode === "tree" && this.#activeFile) {
      this.#expandFileParents(this.#activeFile);
    }
    this.#renderCurrentFiles();
    if (notify) {
      this.#callbacks.onViewModeChange?.(mode);
    }
  }

  setFileReviewState(state: Map<string, PullRequestFileReviewState>): void {
    this.#fileReviewState = new Map(state);
    this.#renderCurrentFiles();
  }

  #renderFile(
    file: DiffFile,
    opts: { depth: number; showDir: boolean; treeMode: boolean }
  ): HTMLElement {
    const review = this.#fileReviewState.get(file.path);
    const isSeen = review?.seen ?? false;
    const attention = review?.attention ?? null;
    const statusIcon = { added: "+", deleted: "\u2212", modified: "\u2219", renamed: "R" }[file.status];
    const statusClass = `fp-status-${file.status}`;
    const fileName = file.path.split("/").pop() ?? file.path;
    const dirPath = file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : "";
    const { adds, dels } = countFileChanges(file);
    const delta = [
      adds > 0 ? h("span", { class: "fp-delta-add" }, [`+${adds}`]) : null as any,
      dels > 0 ? h("span", { class: "fp-delta-del" }, [`-${dels}`]) : null as any,
    ].filter(Boolean) as HTMLElement[];

    const paddingLeft = 10 + (opts.depth * 14);
    const item = h(
      "div",
      {
        class: `fp-file-item${opts.treeMode ? " tree-mode" : ""}${file.path === this.#activeFile ? " active" : ""}${isSeen ? " seen" : ""}${attention ? ` attention-${attention}` : ""}`,
        dataset: { filePath: file.path },
        style: {
          paddingLeft: `${paddingLeft}px`,
        },
        onclick: () => {
          this.setActiveFile(file.path);
          this.#callbacks.onSelectFile(file.path);
        },
      },
      [
        h("span", { class: `fp-status ${statusClass}` }, [statusIcon]),
        h("div", { class: "fp-file-info" }, [
          h("div", { class: "fp-file-name-row" }, [
            h("span", { class: "fp-file-name" }, [fileName]),
            delta.length > 0 ? h("span", { class: "fp-file-delta" }, delta) : null as any,
            this.#reviewMode && isSeen
              ? h("span", { class: "fp-review-chip fp-review-chip-seen" }, ["Seen"])
              : null as any,
            this.#reviewMode && attention
              ? h("span", { class: `fp-review-chip fp-review-chip-${attention}` }, [
                  attention === "new" ? "New" : "Updated",
                ])
              : null as any,
          ].filter(Boolean)),
          opts.showDir && dirPath
            ? h("span", { class: "fp-file-dir" }, [dirPath])
            : null as any,
        ].filter(Boolean)),
        this.#reviewMode && this.#callbacks.onToggleFileSeen
          ? h("button", {
              class: `fp-seen-toggle${isSeen ? " active" : ""}`,
              title: isSeen ? "Mark as unseen" : "Mark as seen",
              onclick: (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#callbacks.onToggleFileSeen?.(file.path, !isSeen);
              },
            }, [isSeen ? "\u2713" : "\u2610"])
          : null as any,
        file.isBinary ? h("span", { class: "fp-binary-tag" }, ["bin"]) : null as any,
      ].filter(Boolean)
    );
    this.#fileItemEls.set(file.path, item);
    return item;
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

function buildFileTree(files: DiffFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    dirs: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (parts.length <= 1) {
      root.files.push(file);
      continue;
    }

    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const nextPath = node.path ? `${node.path}/${name}` : name;
      let next = node.dirs.get(name);
      if (!next) {
        next = {
          name,
          path: nextPath,
          dirs: new Map(),
          files: [],
        };
        node.dirs.set(name, next);
      }
      node = next;
    }
    node.files.push(file);
  }

  return root;
}

function collectTreePaths(node: FileTreeNode, out: Set<string>): void {
  for (const child of node.dirs.values()) {
    out.add(child.path);
    collectTreePaths(child, out);
  }
}

function countTreeFiles(node: FileTreeNode): number {
  let total = node.files.length;
  for (const child of node.dirs.values()) {
    total += countTreeFiles(child);
  }
  return total;
}
