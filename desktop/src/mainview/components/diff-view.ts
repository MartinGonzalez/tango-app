import { h, clearChildren } from "../lib/dom.ts";
import { stageBranchIcon } from "../lib/icons.ts";
import type { PullRequestFileReviewState } from "../lib/pr-file-review.ts";
import type {
  DiffFile,
  DiffLine,
  PullRequestReviewThread,
  StageFileContent,
} from "../../shared/types.ts";
import { renderMarkdown } from "./chat-view.ts";
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
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";

export type DiffViewCallbacks = {
  onBranchPanelToggle?: (visible: boolean) => void;
  onCommitClick?: () => void;
  onRequestFullFile?: (path: string) => Promise<StageFileContent>;
  onToggleFileSeen?: (path: string, seen: boolean) => void;
  onReplyReviewThread?: (
    thread: PullRequestReviewThread,
    body: string
  ) => Promise<void> | void;
  onCreateReviewComment?: (params: {
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    body: string;
  }) => Promise<void> | void;
};

type FullFileLoadState = {
  status: "loading" | "loaded" | "error";
  content: string;
  truncated: boolean;
  isBinary: boolean;
  message: string;
};

type InlineCommentTarget = {
  key: string;
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
  oldLineNo: number | null;
  newLineNo: number | null;
};

type SetFilesOptions = {
  activeFile?: string | null;
  scrollToActive?: boolean;
};

const MAX_AUTO_EXPANDED_FILES = 40;

/**
 * Diff content panel — renders all changed files.
 * Each file can be collapsed/expanded independently.
 */
export class DiffView {
  #el: HTMLElement;
  #toolbarEl: HTMLElement;
  #bodyEl: HTMLElement;
  #contentEl: HTMLElement;
  #filesHostEl: HTMLElement;
  #branchHostEl: HTMLElement;
  #filesToggleBtn: HTMLButtonElement;
  #branchToggleBtn: HTMLButtonElement;
  #commitBtn: HTMLButtonElement;
  #callbacks: DiffViewCallbacks;
  #files: DiffFile[] = [];
  #activeFile: string | null = null;
  #fileExpanded = new Map<string, boolean>();
  #viewMode: "unified" | "split" = "unified";
  #filesPanelVisible = false;
  #branchPanelVisible = false;
  #fullFileVisible = new Set<string>();
  #fullFileLoadState = new Map<string, FullFileLoadState>();
  #fullFileRequestIds = new Map<string, number>();
  #openActionsFilePath: string | null = null;
  #reviewMode = false;
  #fileReviewState = new Map<string, PullRequestFileReviewState>();
  #reviewThreads: PullRequestReviewThread[] = [];
  #reviewThreadsByPath = new Map<string, PullRequestReviewThread[]>();
  #threadExpanded = new Map<string, boolean>();
  #threadReplyComposerOpen = new Map<string, boolean>();
  #threadReplyDraft = new Map<string, string>();
  #threadReplySubmitting = new Set<string>();
  #threadReplyError = new Map<string, string>();
  #inlineCommentTarget: InlineCommentTarget | null = null;
  #inlineCommentDraft = "";
  #inlineCommentSubmitting = false;
  #inlineCommentError: string | null = null;
  #onGlobalClick: (event: MouseEvent) => void;
  #onGlobalKeyDown: (event: KeyboardEvent) => void;
  #fileSectionEls = new Map<string, HTMLDetailsElement>();
  #fileActionsMenus = new Map<string, HTMLElement>();
  #commitButtonVisible = false;

  constructor(container: HTMLElement, callbacks: DiffViewCallbacks = {}) {
    this.#callbacks = callbacks;
    this.#onGlobalClick = (event: MouseEvent) => {
      if (!this.#openActionsFilePath) return;
      const target = event.target;
      if (
        target instanceof Element
        && this.#el.contains(target)
        && target.closest(".dv-file-actions")
      ) {
        return;
      }
      this.#closeActionsMenu();
    };
    this.#onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (this.#openActionsFilePath) {
        this.#closeActionsMenu();
        return;
      }
      if (this.#inlineCommentTarget && !this.#inlineCommentSubmitting) {
        this.#closeInlineCommentComposer();
      }
    };

    this.#filesToggleBtn = h("button", {
      class: "dv-icon-btn",
      title: "Toggle files changed",
      onclick: () => this.toggleFilesPanel(),
    }, [
      h("span", { class: "material-symbols-outlined", "aria-hidden": "true" }, ["folder_open"]),
    ]) as HTMLButtonElement;

    this.#branchToggleBtn = h("button", {
      class: "dv-icon-btn",
      title: "Toggle branch history",
      onclick: () => this.toggleBranchPanel(),
    }, [stageBranchIcon("dv-icon-branch")]) as HTMLButtonElement;

    this.#commitBtn = h("button", {
      class: "dv-commit-btn",
      title: "Commit changes",
      hidden: true,
      onclick: () => this.#callbacks.onCommitClick?.(),
    }, ["Commit"]) as HTMLButtonElement;

    this.#toolbarEl = h("div", { class: "dv-toolbar" }, [
      h("span", { class: "dv-file-label" }, [""]),
      h("span", { class: "dv-toolbar-spacer" }),
      h("div", { class: "dv-toggle-group" }, [
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
      ]),
      this.#filesToggleBtn,
      this.#branchToggleBtn,
      this.#commitBtn,
    ]);

    this.#contentEl = h("div", { class: "dv-content" });
    this.#filesHostEl = h("aside", { class: "dv-files-host", hidden: true });
    this.#branchHostEl = h("aside", { class: "dv-branch-host", hidden: true });
    this.#bodyEl = h("div", { class: "dv-body" }, [
      this.#contentEl,
      this.#filesHostEl,
      this.#branchHostEl,
    ]);

    this.#el = h("div", { class: "diff-view" }, [
      this.#toolbarEl,
      this.#bodyEl,
    ]);

    this.setFilesPanelVisible(false);
    this.setBranchPanelVisible(false, false);
    container.appendChild(this.#el);
    document.addEventListener("click", this.#onGlobalClick);
    document.addEventListener("keydown", this.#onGlobalKeyDown);
  }

  setFiles(files: DiffFile[], options: SetFilesOptions = {}): void {
    this.#files = files;
    const autoExpandByDefault = files.length <= MAX_AUTO_EXPANDED_FILES;
    const nextPaths = new Set(files.map((file) => file.path));
    const nextExpanded = new Map<string, boolean>();
    const nextVisible = new Set<string>();
    const nextFullState = new Map<string, FullFileLoadState>();
    const nextRequestIds = new Map<string, number>();
    for (const file of files) {
      const reviewState = this.#fileReviewState.get(file.path);
      const defaultExpanded = this.#reviewMode && reviewState?.seen
        ? false
        : autoExpandByDefault;
      nextExpanded.set(
        file.path,
        this.#fileExpanded.get(file.path) ?? defaultExpanded
      );
      if (this.#fullFileVisible.has(file.path)) {
        nextVisible.add(file.path);
      }
      const fullState = this.#fullFileLoadState.get(file.path);
      if (fullState) {
        nextFullState.set(file.path, fullState);
      }
      const requestId = this.#fullFileRequestIds.get(file.path);
      if (requestId) {
        nextRequestIds.set(file.path, requestId);
      }
    }
    this.#fileExpanded = nextExpanded;
    this.#fullFileVisible = nextVisible;
    this.#fullFileLoadState = nextFullState;
    this.#fullFileRequestIds = nextRequestIds;
    if (options.activeFile !== undefined) {
      this.#activeFile = options.activeFile && nextPaths.has(options.activeFile)
        ? options.activeFile
        : null;
    }
    if (this.#activeFile && !files.some((f) => f.path === this.#activeFile)) {
      this.#activeFile = null;
    }
    if (this.#activeFile) {
      this.#fileExpanded.set(this.#activeFile, true);
    }
    if (this.#openActionsFilePath && !nextPaths.has(this.#openActionsFilePath)) {
      this.#openActionsFilePath = null;
    }
    if (this.#inlineCommentTarget && !nextPaths.has(this.#inlineCommentTarget.path)) {
      this.#inlineCommentTarget = null;
      this.#inlineCommentDraft = "";
      this.#inlineCommentSubmitting = false;
      this.#inlineCommentError = null;
    }
    this.#renderDiff(options.scrollToActive ?? true);
  }

  showFile(path: string): void {
    const previousActive = this.#activeFile;
    this.#activeFile = path;
    this.#fileExpanded.set(path, true);

    if (this.#fileSectionEls.size === 0) {
      this.#renderDiff();
      this.#scrollToFile(path);
      return;
    }

    if (previousActive && previousActive !== path) {
      this.#fileSectionEls.get(previousActive)?.classList.remove("active");
    }

    const target = this.#fileSectionEls.get(path);
    if (!target) {
      this.#renderDiff();
      this.#scrollToFile(path);
      return;
    }

    target.classList.add("active");
    if (!target.open) {
      target.open = true;
    }
    this.#scrollToFile(path);
  }

  clear(): void {
    this.#files = [];
    this.#activeFile = null;
    this.#fileExpanded.clear();
    this.#fullFileVisible.clear();
    this.#fullFileLoadState.clear();
    this.#fullFileRequestIds.clear();
    this.#fileSectionEls.clear();
    this.#fileActionsMenus.clear();
    this.#fileReviewState.clear();
    this.#reviewThreads = [];
    this.#reviewThreadsByPath.clear();
    this.#threadExpanded.clear();
    this.#threadReplyComposerOpen.clear();
    this.#threadReplyDraft.clear();
    this.#threadReplySubmitting.clear();
    this.#threadReplyError.clear();
    this.#inlineCommentTarget = null;
    this.#inlineCommentDraft = "";
    this.#inlineCommentSubmitting = false;
    this.#inlineCommentError = null;
    this.#openActionsFilePath = null;
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    if (label) label.textContent = "";
    this.#contentEl.replaceChildren(h("div", { class: "dv-empty" }, ["No changes"]));
  }

  setReviewMode(enabled: boolean): void {
    this.#reviewMode = enabled;
    this.#el.classList.toggle("review-mode", enabled);
    this.#branchToggleBtn.hidden = enabled;
    this.#commitBtn.hidden = enabled || !this.#commitButtonVisible;
    if (enabled) {
      this.#fullFileVisible.clear();
      this.#fullFileLoadState.clear();
      this.#fullFileRequestIds.clear();
    }
    if (enabled && this.#branchPanelVisible) {
      this.setBranchPanelVisible(false, false);
    }
    if (enabled && this.#openActionsFilePath) {
      this.#closeActionsMenu();
    }
    if (!enabled && this.#inlineCommentTarget) {
      this.#inlineCommentTarget = null;
      this.#inlineCommentDraft = "";
      this.#inlineCommentSubmitting = false;
      this.#inlineCommentError = null;
    }
    this.#renderDiff(false);
  }

  setFileReviewState(state: Map<string, PullRequestFileReviewState>): void {
    this.#fileReviewState = new Map(state);

    if (this.#reviewMode) {
      for (const file of this.#files) {
        const review = this.#fileReviewState.get(file.path);
        if (review?.seen && file.path !== this.#activeFile) {
          this.#fileExpanded.set(file.path, false);
        }
      }
    }

    this.#renderDiff(false);
  }

  setReviewThreads(threads: PullRequestReviewThread[]): void {
    this.#reviewThreads = [...threads];
    const byPath = new Map<string, PullRequestReviewThread[]>();
    const validIds = new Set<string>();
    for (const thread of threads) {
      const path = String(thread.path ?? "").trim();
      if (!path) continue;
      const anchorLine = thread.line ?? thread.originalLine;
      if (anchorLine == null) continue;
      validIds.add(thread.id);
      const list = byPath.get(path) ?? [];
      list.push(thread);
      byPath.set(path, list);
    }
    for (const threadId of this.#threadExpanded.keys()) {
      if (!validIds.has(threadId)) {
        this.#threadExpanded.delete(threadId);
      }
    }
    for (const threadId of this.#threadReplyComposerOpen.keys()) {
      if (!validIds.has(threadId)) {
        this.#threadReplyComposerOpen.delete(threadId);
      }
    }
    for (const threadId of this.#threadReplyDraft.keys()) {
      if (!validIds.has(threadId)) {
        this.#threadReplyDraft.delete(threadId);
      }
    }
    for (const threadId of this.#threadReplyError.keys()) {
      if (!validIds.has(threadId)) {
        this.#threadReplyError.delete(threadId);
      }
    }
    for (const threadId of this.#threadReplySubmitting) {
      if (!validIds.has(threadId)) {
        this.#threadReplySubmitting.delete(threadId);
      }
    }
    this.#reviewThreadsByPath = byPath;
    this.#renderDiff(false);
  }

  #renderDiff(scrollToActive = true): void {
    const label = this.#toolbarEl.querySelector(".dv-file-label");
    this.#fileSectionEls.clear();
    this.#fileActionsMenus.clear();

    if (this.#files.length === 0) {
      if (label) label.textContent = "";
      this.#contentEl.replaceChildren(h("div", { class: "dv-empty" }, ["No changes"]));
      return;
    }

    if (label) {
      label.textContent = `${this.#files.length} file${this.#files.length !== 1 ? "s" : ""} changed`;
    }

    const fragment = document.createDocumentFragment();
    for (const file of this.#files) {
      fragment.appendChild(this.#renderFileSection(file));
    }
    this.#contentEl.replaceChildren(fragment);

    if (scrollToActive && this.#activeFile) {
      this.#scrollToFile(this.#activeFile);
    }
  }

  #renderFileSection(file: DiffFile): HTMLElement {
    const review = this.#fileReviewState.get(file.path);
    const attention = review?.attention ?? null;
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
    const threadCommentCount = this.#countThreadCommentsForFile(file.path);

    const details = h("details", {
      class: `dv-file-section${file.path === this.#activeFile ? " active" : ""}${review?.seen ? " seen" : ""}${attention ? ` has-attention attention-${attention}` : ""}`,
      dataset: { filePath: file.path },
    }) as HTMLDetailsElement;
    details.open = this.#fileExpanded.get(file.path) ?? true;

    details.appendChild(
      h("summary", { class: "dv-file-summary" }, [
        h("span", { class: `dv-file-status dv-file-status-${file.status}` }, [statusSymbol]),
        h("span", { class: "dv-file-main" }, [
          h("span", { class: "dv-file-path" }, [file.path]),
          delta.length > 0 ? h("span", { class: "dv-file-delta" }, delta) : null as any,
          this.#reviewMode && review?.seen
            ? h("span", { class: "dv-review-chip dv-review-chip-seen" }, ["Seen"])
            : null as any,
          this.#reviewMode && attention
            ? h("span", { class: `dv-review-chip dv-review-chip-${attention}` }, [
                attention === "new" ? "New" : "Updated",
              ])
            : null as any,
          this.#reviewMode && threadCommentCount > 0
            ? h("span", { class: "dv-thread-count-chip", title: `${threadCommentCount} comment${threadCommentCount === 1 ? "" : "s"}` }, [
                h("span", {
                  class: "dv-thread-count-icon",
                  "aria-hidden": "true",
                  innerHTML: threadCountIconSvg(),
                }),
                h("span", { class: "dv-thread-count-value" }, [String(threadCommentCount)]),
              ])
            : null as any,
        ].filter(Boolean)),
        file.isBinary ? h("span", { class: "dv-file-binary" }, ["bin"]) : null as any,
        this.#renderFileActions(file),
      ].filter(Boolean))
    );

    const body = h("div", { class: "dv-file-body" });
    const renderBody = () => {
      clearChildren(body);
      if (!details.open) return;

      if (file.isBinary) {
        body.appendChild(h("div", { class: "dv-file-empty" }, ["Binary file changed"]));
      } else if (file.hunks.length === 0) {
        body.appendChild(h("div", { class: "dv-file-empty" }, ["Empty diff"]));
      } else if (this.#viewMode === "unified") {
        body.appendChild(this.#buildUnifiedTable(file));
      } else {
        body.appendChild(this.#buildSplitTable(file));
      }

      const fullFileView = this.#renderFullFileView(file.path);
      if (fullFileView) {
        body.appendChild(fullFileView);
      }
    };
    details.addEventListener("toggle", () => {
      this.#fileExpanded.set(file.path, details.open);
      renderBody();
    });
    renderBody();

    details.appendChild(body);
    this.#fileSectionEls.set(file.path, details);
    return details;
  }

  #renderFileActions(file: DiffFile): HTMLElement {
    const isMenuOpen = this.#openActionsFilePath === file.path;
    const isFullVisible = this.#fullFileVisible.has(file.path);
    const actionLabel = isFullVisible ? "Hide full" : "Show full";
    const isSeen = this.#fileReviewState.get(file.path)?.seen ?? false;
    const canToggleSeen = this.#reviewMode && Boolean(this.#callbacks.onToggleFileSeen);
    const showMenu = !this.#reviewMode;

    const actions = h("div", { class: "dv-file-actions" });

    if (canToggleSeen) {
      const seenToggle = h("button", {
        class: `dv-seen-toggle${isSeen ? " active" : ""}`,
        title: isSeen ? "Mark as unread" : "Mark as read",
        "aria-label": isSeen
          ? `Mark ${file.path} as unread`
          : `Mark ${file.path} as read`,
        "aria-pressed": String(isSeen),
        onclick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          this.#callbacks.onToggleFileSeen?.(file.path, !isSeen);
        },
      }, [isSeen ? "\u2713" : "\u2610"]) as HTMLButtonElement;
      actions.appendChild(seenToggle);
    }

    if (showMenu) {
      const menuButton = h("button", {
        class: "dv-file-actions-btn",
        title: "More actions",
        "aria-label": `More actions for ${file.path}`,
        onclick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          this.#toggleFileActionsMenu(file.path);
        },
      }, [
        h("span", { class: "menu-dots-icon", "aria-hidden": "true" }, [
          h("span", { class: "material-symbols-outlined" }, ["more_vert"]),
        ]),
      ]) as HTMLButtonElement;

      const actionButton = h("button", {
        class: "dv-file-actions-item",
        onclick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          this.#openActionsFilePath = null;
          this.#toggleShowFullFile(file.path);
        },
      }, [actionLabel]) as HTMLButtonElement;

      const menu = h("div", {
        class: "dv-file-actions-menu",
        hidden: !isMenuOpen,
      }, [actionButton]);
      menu.addEventListener("mousedown", (event) => event.stopPropagation());
      menu.addEventListener("click", (event) => event.stopPropagation());
      actions.appendChild(menuButton);
      actions.appendChild(menu);
      this.#fileActionsMenus.set(file.path, menu);
    } else {
      this.#fileActionsMenus.delete(file.path);
    }

    actions.addEventListener("mousedown", (event) => event.stopPropagation());
    actions.addEventListener("click", (event) => event.stopPropagation());
    return actions;
  }

  #toggleFileActionsMenu(path: string): void {
    if (this.#reviewMode) return;
    this.#setOpenActionsFilePath(this.#openActionsFilePath === path ? null : path);
  }

  #toggleShowFullFile(path: string): void {
    if (this.#reviewMode) return;
    if (this.#fullFileVisible.has(path)) {
      this.#fullFileVisible.delete(path);
      this.#rerenderFileSection(path);
      return;
    }

    this.#fullFileVisible.add(path);
    const existing = this.#fullFileLoadState.get(path);
    if (existing?.status === "loaded" || existing?.status === "loading") {
      this.#rerenderFileSection(path);
      return;
    }

    if (!this.#callbacks.onRequestFullFile) {
      this.#fullFileLoadState.set(path, {
        status: "error",
        content: "",
        truncated: false,
        isBinary: false,
        message: "Show full is unavailable",
      });
      this.#rerenderFileSection(path);
      return;
    }

    const requestId = (this.#fullFileRequestIds.get(path) ?? 0) + 1;
    this.#fullFileRequestIds.set(path, requestId);
    this.#fullFileLoadState.set(path, {
      status: "loading",
      content: "",
      truncated: false,
      isBinary: false,
      message: "",
    });
    this.#rerenderFileSection(path);

    void this.#callbacks
      .onRequestFullFile(path)
      .then((result) => {
        if (this.#fullFileRequestIds.get(path) !== requestId) return;
        this.#fullFileLoadState.set(path, {
          status: "loaded",
          content: result.content,
          truncated: result.truncated,
          isBinary: result.isBinary,
          message: "",
        });
        this.#rerenderFileSection(path);
      })
      .catch((error: unknown) => {
        if (this.#fullFileRequestIds.get(path) !== requestId) return;
        const message = error instanceof Error
          ? error.message
          : "Failed to load full file";
        this.#fullFileLoadState.set(path, {
          status: "error",
          content: "",
          truncated: false,
          isBinary: false,
          message,
        });
        this.#rerenderFileSection(path);
      });
  }

  #renderFullFileView(path: string): HTMLElement | null {
    if (!this.#fullFileVisible.has(path)) return null;

    const state = this.#fullFileLoadState.get(path);
    const container = h("div", { class: "dv-fullfile" });

    if (!state || state.status === "loading") {
      container.appendChild(
        h("div", { class: "dv-fullfile-message" }, ["Loading full file..."])
      );
      return container;
    }

    if (state.status === "error") {
      container.appendChild(
        h("div", { class: "dv-fullfile-message dv-fullfile-message-error" }, [
          state.message || "Failed to load full file",
        ])
      );
      return container;
    }

    if (state.isBinary) {
      container.appendChild(
        h("div", { class: "dv-fullfile-message" }, ["Binary file"])
      );
      return container;
    }

    const headerItems: (HTMLElement | string)[] = [
      h("span", { class: "dv-fullfile-title" }, ["Full file"]),
    ];
    if (state.truncated) {
      headerItems.push(
        h("span", { class: "dv-fullfile-note" }, ["Showing first 300KB"])
      );
    }
    container.appendChild(h("div", { class: "dv-fullfile-header" }, headerItems));

    const table = h("table", { class: "diff-table dv-fullfile-table" });
    const lines = state.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      table.appendChild(
        h("tr", { class: "diff-line" }, [
          h("td", { class: "line-no" }, [String(i + 1)]),
          h("td", {
            class: "line-content",
            innerHTML: line ? highlightCodeLine(line, path) : "&nbsp;",
          }),
        ])
      );
    }

    container.appendChild(table);
    return container;
  }

  #collectThreadsForLine(
    filePath: string,
    oldLineNo: number | null,
    newLineNo: number | null
  ): PullRequestReviewThread[] {
    if (!this.#reviewMode) return [];
    const threads = this.#reviewThreadsByPath.get(filePath);
    if (!threads || threads.length === 0) return [];

    const matches = new Map<string, PullRequestReviewThread>();
    for (const thread of threads) {
      const anchorLine = thread.line ?? thread.originalLine;
      if (anchorLine == null) continue;
      const side = normalizeReviewThreadSide(thread);

      if (
        (side === "LEFT" || side === "BOTH")
        && oldLineNo != null
        && oldLineNo === anchorLine
      ) {
        matches.set(thread.id, thread);
      }
      if (
        (side === "RIGHT" || side === "BOTH")
        && newLineNo != null
        && newLineNo === anchorLine
      ) {
        matches.set(thread.id, thread);
      }
    }

    return [...matches.values()].sort(compareReviewThreadsByDate);
  }

  #countThreadCommentsForFile(filePath: string): number {
    if (!this.#reviewMode) return 0;
    const threads = this.#reviewThreadsByPath.get(filePath);
    if (!threads || threads.length === 0) return 0;

    let total = 0;
    for (const thread of threads) {
      total += thread.comments.length;
    }
    return total;
  }

  #renderThreadRow(
    threads: PullRequestReviewThread[],
    columnCount: number
  ): HTMLElement {
    const bubble = h("div", { class: "dv-thread-bubble" });
    for (const thread of threads) {
      bubble.appendChild(this.#renderThreadCard(thread));
    }

    return h("tr", { class: "dv-thread-row" }, [
      h("td", { class: "dv-thread-cell", colspan: String(columnCount) }, [bubble]),
    ]);
  }

  #renderThreadCard(thread: PullRequestReviewThread): HTMLElement {
    const label = formatReviewThreadAnchor(thread);
    const commentCount = thread.comments.length;
    const card = h("details", { class: "dv-thread-card" }) as HTMLDetailsElement;
    card.open = this.#threadExpanded.get(thread.id) ?? false;
    card.addEventListener("toggle", () => {
      this.#threadExpanded.set(thread.id, card.open);
    });

    card.appendChild(
      h("summary", { class: "dv-thread-card-head" }, [
        h("span", { class: "dv-thread-card-head-left" }, [
          h("span", { class: "dv-thread-card-caret", "aria-hidden": "true" }, ["\u25B8"]),
          h("span", { class: "dv-thread-card-label" }, [`Comment on line ${label}`]),
        ]),
        h("span", { class: "dv-thread-card-head-right" }, [
          h("span", { class: "dv-thread-card-count" }, [`${commentCount} comment${commentCount === 1 ? "" : "s"}`]),
          thread.isResolved
            ? h("span", { class: "dv-thread-card-resolved" }, ["Resolved"])
            : null as any,
        ].filter(Boolean)),
      ])
    );

    for (const comment of thread.comments) {
      card.appendChild(
        h("div", { class: "dv-thread-comment" }, [
          h("div", { class: "dv-thread-comment-head" }, [
            h("span", { class: "dv-thread-comment-author" }, [`@${comment.authorLogin}`]),
            h("span", { class: "dv-thread-comment-time" }, [formatReviewThreadTime(comment.createdAt)]),
          ]),
          h("div", {
            class: "dv-thread-comment-body",
            innerHTML: renderMarkdown(comment.body || "_No content_"),
          }),
        ])
      );
    }

    const replyComposer = this.#renderThreadReplyComposer(thread);
    if (replyComposer) {
      card.appendChild(replyComposer);
    }

    return card;
  }

  #renderThreadReplyComposer(thread: PullRequestReviewThread): HTMLElement | null {
    if (!this.#callbacks.onReplyReviewThread) return null;

    const threadId = thread.id;
    const composerOpen = this.#threadReplyComposerOpen.get(threadId) ?? false;
    const draft = this.#threadReplyDraft.get(threadId) ?? "";
    const submitting = this.#threadReplySubmitting.has(threadId);
    const errorMessage = this.#threadReplyError.get(threadId) ?? "";
    const holder = h("div", { class: "dv-thread-reply" });

    if (!composerOpen) {
      holder.appendChild(
        h("button", {
          class: "dv-thread-reply-trigger",
          type: "button",
          onclick: (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            this.#threadReplyComposerOpen.set(threadId, true);
            this.#threadReplyError.delete(threadId);
            this.#rerenderFileSection(thread.path);
          },
        }, ["Reply"])
      );
      return holder;
    }

    const textarea = h("textarea", {
      class: "dv-thread-reply-input",
      rows: "3",
      placeholder: "Write a reply",
      disabled: submitting,
      oninput: (event: Event) => {
        const value = (event.target as HTMLTextAreaElement).value;
        this.#threadReplyDraft.set(threadId, value);
        if (this.#threadReplyError.has(threadId)) {
          this.#threadReplyError.delete(threadId);
          this.#rerenderFileSection(thread.path);
        }
      },
    }) as HTMLTextAreaElement;
    textarea.value = draft;

    const cancelButton = h("button", {
      class: "dv-thread-reply-btn ghost",
      type: "button",
      disabled: submitting,
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#threadReplyComposerOpen.set(threadId, false);
        this.#threadReplyError.delete(threadId);
        this.#rerenderFileSection(thread.path);
      },
    }, ["Cancel"]);

    const sendButton = h("button", {
      class: "dv-thread-reply-btn",
      type: "button",
      disabled: submitting,
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.#submitThreadReply(thread);
      },
    }, [submitting ? "Sending..." : "Comment"]);

    holder.appendChild(textarea);
    if (errorMessage) {
      holder.appendChild(h("div", { class: "dv-thread-reply-error" }, [errorMessage]));
    }
    holder.appendChild(h("div", { class: "dv-thread-reply-actions" }, [
      cancelButton,
      sendButton,
    ]));

    return holder;
  }

  async #submitThreadReply(thread: PullRequestReviewThread): Promise<void> {
    const callback = this.#callbacks.onReplyReviewThread;
    if (!callback) return;

    const threadId = thread.id;
    const replyBody = (this.#threadReplyDraft.get(threadId) ?? "").trim();
    if (!replyBody) {
      this.#threadReplyError.set(threadId, "Reply cannot be empty.");
      this.#rerenderFileSection(thread.path);
      return;
    }

    this.#threadReplySubmitting.add(threadId);
    this.#threadReplyError.delete(threadId);
    this.#rerenderFileSection(thread.path);

    try {
      await callback(thread, replyBody);
      this.#threadReplyDraft.delete(threadId);
      this.#threadReplyComposerOpen.set(threadId, false);
      this.#threadReplyError.delete(threadId);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to send reply";
      this.#threadReplyError.set(threadId, message || "Failed to send reply");
    } finally {
      this.#threadReplySubmitting.delete(threadId);
      this.#rerenderFileSection(thread.path);
    }
  }

  #canCreateReviewComments(): boolean {
    return this.#reviewMode && Boolean(this.#callbacks.onCreateReviewComment);
  }

  #resolveUnifiedCommentTarget(filePath: string, line: DiffLine): InlineCommentTarget | null {
    if (!this.#canCreateReviewComments()) return null;

    if (line.type === "delete" && line.oldLineNo != null) {
      return {
        key: `${filePath}:LEFT:${line.oldLineNo}`,
        path: filePath,
        side: "LEFT",
        line: line.oldLineNo,
        oldLineNo: line.oldLineNo,
        newLineNo: line.newLineNo ?? null,
      };
    }

    if ((line.type === "add" || line.type === "context") && line.newLineNo != null) {
      return {
        key: `${filePath}:RIGHT:${line.newLineNo}`,
        path: filePath,
        side: "RIGHT",
        line: line.newLineNo,
        oldLineNo: line.oldLineNo ?? null,
        newLineNo: line.newLineNo,
      };
    }

    return null;
  }

  #resolveSplitCommentTarget(
    filePath: string,
    line: DiffLine | null,
    side: "LEFT" | "RIGHT"
  ): InlineCommentTarget | null {
    if (!this.#canCreateReviewComments() || !line) return null;
    const lineNo = side === "LEFT" ? line.oldLineNo : line.newLineNo;
    if (lineNo == null) return null;

    return {
      key: `${filePath}:${side}:${lineNo}`,
      path: filePath,
      side,
      line: lineNo,
      oldLineNo: line.oldLineNo ?? null,
      newLineNo: line.newLineNo ?? null,
    };
  }

  #isInlineCommentTarget(target: InlineCommentTarget | null): boolean {
    if (!target || !this.#inlineCommentTarget) return false;
    return this.#inlineCommentTarget.key === target.key;
  }

  #openInlineCommentComposer(target: InlineCommentTarget): void {
    if (!this.#canCreateReviewComments()) return;

    const previousTarget = this.#inlineCommentTarget;
    const hasChangedTarget = !previousTarget || previousTarget.key !== target.key;
    const previousPath = previousTarget?.path ?? null;
    this.#inlineCommentTarget = target;
    this.#inlineCommentError = null;
    if (hasChangedTarget) {
      this.#inlineCommentDraft = "";
    }

    if (previousPath && previousPath !== target.path) {
      this.#rerenderFileSection(previousPath);
    }
    this.#rerenderFileSection(target.path);
  }

  #closeInlineCommentComposer(): void {
    const target = this.#inlineCommentTarget;
    if (!target) return;
    const path = target.path;
    this.#inlineCommentTarget = null;
    this.#inlineCommentDraft = "";
    this.#inlineCommentSubmitting = false;
    this.#inlineCommentError = null;
    this.#rerenderFileSection(path);
  }

  #renderInlineCommentRow(
    target: InlineCommentTarget,
    columnCount: number
  ): HTMLElement {
    const label = target.side === "LEFT"
      ? `L${target.line}`
      : `R${target.line}`;

    const textarea = h("textarea", {
      class: "dv-inline-comment-input",
      rows: "3",
      placeholder: "Write a comment",
      disabled: this.#inlineCommentSubmitting,
      oninput: (event: Event) => {
        this.#inlineCommentDraft = (event.target as HTMLTextAreaElement).value;
        if (this.#inlineCommentError) {
          this.#inlineCommentError = null;
          this.#rerenderFileSection(target.path);
        }
      },
    }) as HTMLTextAreaElement;
    textarea.value = this.#inlineCommentDraft;

    const cancelButton = h("button", {
      class: "dv-inline-comment-btn ghost",
      type: "button",
      disabled: this.#inlineCommentSubmitting,
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#closeInlineCommentComposer();
      },
    }, ["Cancel"]);

    const sendButton = h("button", {
      class: "dv-inline-comment-btn",
      type: "button",
      disabled: this.#inlineCommentSubmitting,
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.#submitInlineComment(target);
      },
    }, [this.#inlineCommentSubmitting ? "Sending..." : "Comment"]);

    return h("tr", { class: "dv-thread-row dv-inline-comment-row" }, [
      h("td", { class: "dv-thread-cell", colspan: String(columnCount) }, [
        h("div", { class: "dv-thread-bubble dv-inline-comment-bubble" }, [
          h("div", { class: "dv-inline-comment-head" }, [
            h("span", { class: "dv-inline-comment-label" }, [`Comment on line ${label}`]),
          ]),
          textarea,
          this.#inlineCommentError
            ? h("div", { class: "dv-inline-comment-error" }, [this.#inlineCommentError])
            : null as any,
          h("div", { class: "dv-inline-comment-actions" }, [
            cancelButton,
            sendButton,
          ]),
        ]),
      ]),
    ]);
  }

  async #submitInlineComment(target: InlineCommentTarget): Promise<void> {
    const callback = this.#callbacks.onCreateReviewComment;
    if (!callback) return;
    if (!this.#inlineCommentTarget || this.#inlineCommentTarget.key !== target.key) return;

    const body = this.#inlineCommentDraft.trim();
    if (!body) {
      this.#inlineCommentError = "Comment cannot be empty.";
      this.#rerenderFileSection(target.path);
      return;
    }

    this.#inlineCommentSubmitting = true;
    this.#inlineCommentError = null;
    this.#rerenderFileSection(target.path);

    try {
      await callback({
        path: target.path,
        line: target.line,
        side: target.side,
        body,
      });
      this.#closeInlineCommentComposer();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to send comment";
      this.#inlineCommentError = message || "Failed to send comment";
      this.#inlineCommentSubmitting = false;
      this.#rerenderFileSection(target.path);
    }
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
        const lineNo = line.type === "add"
          ? line.newLineNo
          : line.type === "delete"
          ? line.oldLineNo
          : (line.newLineNo ?? line.oldLineNo);
        const commentTarget = this.#resolveUnifiedCommentTarget(file.path, line);
        const commentTargetActive = this.#isInlineCommentTarget(commentTarget);

        const lineNoCell = h("td", {
          class: `line-no${commentTarget ? " dv-commentable-cell" : ""}${commentTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: commentTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(commentTarget);
              }
            : undefined,
        }, [
          lineNo != null ? String(lineNo) : "",
        ]);
        const contentCell = h("td", {
          class: `line-content${commentTarget ? " dv-commentable-cell" : ""}${commentTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: commentTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(commentTarget);
              }
            : undefined,
          innerHTML: line.content
            ? highlightCodeLine(line.content, file.path)
            : "&nbsp;",
        });

        table.appendChild(
          h("tr", {
            class: `${lineClass}${commentTarget ? " dv-commentable-line" : ""}${commentTargetActive ? " dv-comment-target-line" : ""}`,
          }, [
            lineNoCell,
            contentCell,
          ])
        );

        const threads = this.#collectThreadsForLine(
          file.path,
          line.oldLineNo ?? null,
          line.newLineNo ?? null
        );
        if (threads.length > 0) {
          table.appendChild(this.#renderThreadRow(threads, 2));
        }

        if (commentTarget && commentTargetActive) {
          table.appendChild(this.#renderInlineCommentRow(commentTarget, 2));
        }
      }
    }

    return h("div", { class: "diff-block" }, [table]);
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
        const leftTarget = this.#resolveSplitCommentTarget(file.path, left, "LEFT");
        const rightTarget = this.#resolveSplitCommentTarget(file.path, right, "RIGHT");
        const leftTargetActive = this.#isInlineCommentTarget(leftTarget);
        const rightTargetActive = this.#isInlineCommentTarget(rightTarget);
        const activeTarget = leftTargetActive
          ? leftTarget
          : rightTargetActive
            ? rightTarget
            : null;

        const leftNoCell = h("td", {
          class: `line-no${leftLineClass}${leftTarget ? " dv-commentable-cell" : ""}${leftTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: leftTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(leftTarget);
              }
            : undefined,
        }, [
          left?.oldLineNo != null ? String(left.oldLineNo) : "",
        ]);
        const leftContentCell = h("td", {
          class: `line-content${leftLineClass}${leftTarget ? " dv-commentable-cell" : ""}${leftTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: leftTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(leftTarget);
              }
            : undefined,
          innerHTML: left
            ? (left.content ? highlightCodeLine(left.content, file.path) : "&nbsp;")
            : "",
        });
        const rightNoCell = h("td", {
          class: `line-no${rightLineClass}${rightTarget ? " dv-commentable-cell" : ""}${rightTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: rightTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(rightTarget);
              }
            : undefined,
        }, [
          right?.newLineNo != null ? String(right.newLineNo) : "",
        ]);
        const rightContentCell = h("td", {
          class: `line-content${rightLineClass}${rightTarget ? " dv-commentable-cell" : ""}${rightTargetActive ? " dv-comment-target-cell" : ""}`,
          onclick: rightTarget
            ? (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.#openInlineCommentComposer(rightTarget);
              }
            : undefined,
          innerHTML: right
            ? (right.content ? highlightCodeLine(right.content, file.path) : "&nbsp;")
            : "",
        });

        table.appendChild(
          h("tr", {
            class: `diff-line${(leftTarget || rightTarget) ? " dv-commentable-line" : ""}${activeTarget ? " dv-comment-target-line" : ""}`,
          }, [
            leftNoCell,
            leftContentCell,
            rightNoCell,
            rightContentCell,
          ])
        );

        const threads = this.#collectThreadsForLine(
          file.path,
          left?.oldLineNo ?? null,
          right?.newLineNo ?? null
        );
        if (threads.length > 0) {
          table.appendChild(this.#renderThreadRow(threads, 4));
        }

        if (activeTarget) {
          table.appendChild(this.#renderInlineCommentRow(activeTarget, 4));
        }
      }
    }

    return h("div", { class: "diff-block" }, [table]);
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
      const target = this.#fileSectionEls.get(path);
      if (!target) return;
      target.scrollIntoView({ block: "nearest" });
    });
  }

  #setOpenActionsFilePath(path: string | null): void {
    if (this.#reviewMode) {
      path = null;
    }
    const previousPath = this.#openActionsFilePath;
    if (previousPath === path) return;

    this.#openActionsFilePath = path;
    let updated = true;

    if (previousPath) {
      const previousMenu = this.#fileActionsMenus.get(previousPath);
      if (previousMenu) {
        previousMenu.hidden = true;
      } else {
        updated = false;
      }
    }

    if (path) {
      const nextMenu = this.#fileActionsMenus.get(path);
      if (nextMenu) {
        nextMenu.hidden = false;
      } else {
        updated = false;
      }
    }

    if (!updated) {
      this.#renderDiff(false);
    }
  }

  #closeActionsMenu(): void {
    if (!this.#openActionsFilePath) return;
    this.#setOpenActionsFilePath(null);
  }

  #rerenderFileSection(path: string): void {
    const current = this.#fileSectionEls.get(path);
    const file = this.#files.find((entry) => entry.path === path);
    if (!current || !file) {
      this.#renderDiff(false);
      return;
    }

    const next = this.#renderFileSection(file);
    current.replaceWith(next);
  }

  setFilesPanelVisible(visible: boolean): void {
    if (visible && this.#branchPanelVisible) {
      this.setBranchPanelVisible(false);
    }

    this.#filesPanelVisible = visible;
    this.#el.classList.toggle("files-visible", visible);
    this.#filesHostEl.hidden = !visible;
    this.#filesToggleBtn.classList.toggle("active", visible);
  }

  toggleFilesPanel(): void {
    this.setFilesPanelVisible(!this.#filesPanelVisible);
  }

  setBranchPanelVisible(visible: boolean, notify = true): void {
    if (this.#reviewMode) {
      visible = false;
    }

    if (visible && this.#filesPanelVisible) {
      this.setFilesPanelVisible(false);
    }

    this.#branchPanelVisible = visible;
    this.#el.classList.toggle("branch-visible", visible);
    this.#branchHostEl.hidden = !visible;
    this.#branchToggleBtn.classList.toggle("active", visible);

    if (notify) {
      this.#callbacks.onBranchPanelToggle?.(visible);
    }
  }

  toggleBranchPanel(): void {
    if (this.#reviewMode) return;
    this.setBranchPanelVisible(!this.#branchPanelVisible);
  }

  setCommitButtonVisible(visible: boolean): void {
    this.#commitButtonVisible = visible;
    this.#commitBtn.hidden = this.#reviewMode || !visible;
  }

  get filesPanelHost(): HTMLElement {
    return this.#filesHostEl;
  }

  get branchPanelHost(): HTMLElement {
    return this.#branchHostEl;
  }

  get isBranchPanelVisible(): boolean {
    return this.#branchPanelVisible;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function normalizeReviewThreadSide(
  thread: PullRequestReviewThread
): "LEFT" | "RIGHT" | "BOTH" {
  const side = String(thread.side ?? "").toUpperCase();
  if (side === "LEFT") return "LEFT";
  if (side === "RIGHT") return "RIGHT";
  if (thread.originalLine != null && thread.line == null) return "LEFT";
  if (thread.line != null) return "RIGHT";
  return "BOTH";
}

function threadCountIconSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4.5 4.8h11a2.3 2.3 0 0 1 2.3 2.3v6a2.3 2.3 0 0 1 -2.3 2.3H9.2l-3.7 2.8v-2.8H4.5a2.3 2.3 0 0 1 -2.3 -2.3v-6a2.3 2.3 0 0 1 2.3 -2.3Z" stroke-linejoin="round"/></svg>';
}

function formatReviewThreadAnchor(thread: PullRequestReviewThread): string {
  const anchorLine = thread.line ?? thread.originalLine;
  const side = normalizeReviewThreadSide(thread);
  if (anchorLine == null) return thread.path;
  if (side === "LEFT") return `L${anchorLine}`;
  if (side === "RIGHT") return `R${anchorLine}`;
  return String(anchorLine);
}

function compareReviewThreadsByDate(
  left: PullRequestReviewThread,
  right: PullRequestReviewThread
): number {
  const tsA = Date.parse(left.createdAt);
  const tsB = Date.parse(right.createdAt);
  if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsA !== tsB) {
    return tsA - tsB;
  }
  return left.id.localeCompare(right.id);
}

function formatReviewThreadTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function highlightCodeLine(content: string, filePath: string): string {
  if (content.length > 8000) {
    return escapeHtml(content);
  }

  const prism = resolvePrism();
  if (!prism) {
    return fallbackHighlight(content);
  }

  const language = languageFromFilePath(filePath);
  const grammar = language ? resolveGrammar(prism.languages, language) : null;

  if (!grammar || !language) {
    return fallbackHighlight(content);
  }

  try {
    const highlighted = prism.highlight(content, grammar, language);
    return highlighted.includes("token") ? highlighted : fallbackHighlight(content);
  } catch {
    return fallbackHighlight(content);
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

type PrismLike = {
  languages: Record<string, Prism.Grammar>;
  highlight: (text: string, grammar: Prism.Grammar, language: string) => string;
};

function resolvePrism(): PrismLike | null {
  const globalPrism = (globalThis as any)?.Prism as PrismLike | undefined;
  if (globalPrism?.highlight && globalPrism?.languages) {
    return globalPrism;
  }

  const imported = Prism as unknown as {
    highlight?: unknown;
    languages?: unknown;
  };
  if (
    typeof imported?.highlight === "function"
    && imported?.languages
    && typeof imported.languages === "object"
  ) {
    return imported as PrismLike;
  }

  return null;
}

function resolveGrammar(
  languages: Record<string, Prism.Grammar>,
  language: string
): Prism.Grammar | null {
  if (languages[language]) return languages[language];

  if (language === "csharp") {
    return languages.cs ?? languages.dotnet ?? null;
  }

  if (language === "typescript") {
    return languages.ts ?? null;
  }

  if (language === "javascript") {
    return languages.js ?? null;
  }

  if (language === "yaml") {
    return languages.yml ?? null;
  }

  return null;
}

const FALLBACK_KEYWORD_REGEX = /\b(import|from|export|default|class|interface|type|enum|public|private|protected|function|const|let|var|return|if|else|for|while|switch|case|break|continue|new|async|await|try|catch|finally|extends|implements|static|readonly|true|false|null|undefined|using|namespace|void|string|int|bool|this|base)\b/g;
const FALLBACK_NUMBER_REGEX = /\b\d+(?:\.\d+)?\b/g;
const FALLBACK_STRING_REGEX = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const FALLBACK_COMMENT_REGEX = /\/\/.*$/g;

function fallbackHighlight(content: string): string {
  let html = escapeHtml(content);
  const tokens: string[] = [];

  const stash = (value: string, className: string): string => {
    const idx = tokens.push(`<span class="token ${className}">${value}</span>`) - 1;
    return `@@DV_FALLBACK_${idx}@@`;
  };

  html = html.replace(FALLBACK_STRING_REGEX, (m) => stash(m, "string"));
  html = html.replace(FALLBACK_COMMENT_REGEX, (m) => stash(m, "comment"));
  html = html.replace(FALLBACK_KEYWORD_REGEX, '<span class="token keyword">$1</span>');
  html = html.replace(FALLBACK_NUMBER_REGEX, '<span class="token number">$&</span>');

  return html.replace(/@@DV_FALLBACK_(\d+)@@/g, (_match, idx) => {
    return tokens[Number(idx)] ?? "";
  });
}
