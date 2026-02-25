import { clearChildren, h } from "../lib/dom.ts";
import { renderMarkdown } from "./chat-view.ts";
import type { PullRequestFileReviewState } from "../lib/pr-file-review.ts";
import type { FileListView } from "./files-panel.ts";
import type {
  PullRequestAgentReviewLevel,
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewRun,
  PullRequestConversationItem,
  PullRequestDetail,
} from "../../shared/types.ts";

export type PRViewCallbacks = {
  onSelectCommit: (commitSha: string | null) => void;
  onOpenPullRequest: (url: string) => void;
  onSelectFile: (path: string) => void;
  onToggleFileSeen?: (path: string, seen: boolean) => void;
  onFilesViewModeChange?: (mode: FileListView) => void;
  onStartAgentReview?: () => void;
  onSelectAgentReviewVersion?: (version: number) => void;
  onApplyAgentReviewIssue?: (params: {
    reviewVersion: number;
    suggestionIndex: number;
  }) => Promise<void> | void;
};

type PRFileRow = PullRequestDetail["files"][number];

type PRFileTreeNode = {
  name: string;
  path: string;
  dirs: Map<string, PRFileTreeNode>;
  files: PRFileRow[];
};

export class PRView {
  #el: HTMLElement;
  #bodyEl: HTMLElement;
  #callbacks: PRViewCallbacks;
  #detail: PullRequestDetail | null = null;
  #loading = false;
  #error: string | null = null;
  #selectedCommitSha: string | null = null;
  #seenCount = 0;
  #totalFiles = 0;
  #fileReviewState = new Map<string, PullRequestFileReviewState>();
  #contentTab: "conversation" | "files_changed" | "agent_reviews" = "conversation";
  #filesTabActivePath: string | null = null;
  #filesViewMode: FileListView = "flat";
  #filesTreeExpanded = new Map<string, boolean>();
  #agentReviews: PullRequestAgentReviewRun[] = [];
  #agentReviewsLoading = false;
  #agentReviewsError: string | null = null;
  #selectedAgentReviewVersion: number | null = null;
  #selectedAgentReviewDocument: PullRequestAgentReviewDocument | null = null;
  #agentReviewStarting = false;
  #applyingReviewIssues = new Set<string>();
  #applyReviewIssueErrors = new Map<string, string>();

  constructor(container: HTMLElement, callbacks: PRViewCallbacks) {
    this.#callbacks = callbacks;

    this.#bodyEl = h("div", { class: "pr-view-body" });
    this.#el = h("section", { class: "pr-view", hidden: true }, [
      this.#bodyEl,
    ]);

    container.appendChild(this.#el);
  }

  render(
    detail: PullRequestDetail | null,
    opts?: {
      loading?: boolean;
      error?: string | null;
      selectedCommitSha?: string | null;
      seenCount?: number;
      totalFiles?: number;
      fileReviewState?: Map<string, PullRequestFileReviewState>;
      filesViewMode?: FileListView;
      agentReviews?: PullRequestAgentReviewRun[];
      agentReviewsLoading?: boolean;
      agentReviewsError?: string | null;
      selectedAgentReviewVersion?: number | null;
      selectedAgentReviewDocument?: PullRequestAgentReviewDocument | null;
      agentReviewStarting?: boolean;
    }
  ): void {
    this.#detail = detail;
    this.#loading = Boolean(opts?.loading);
    this.#error = opts?.error ?? null;
    this.#selectedCommitSha = opts?.selectedCommitSha ?? null;
    this.#seenCount = opts?.seenCount ?? 0;
    this.#totalFiles = opts?.totalFiles ?? detail?.files.length ?? 0;
    this.#fileReviewState = opts?.fileReviewState
      ? new Map(opts.fileReviewState)
      : new Map();
    this.#agentReviews = Array.isArray(opts?.agentReviews)
      ? opts.agentReviews.slice().sort((left, right) => left.version - right.version)
      : [];
    this.#agentReviewsLoading = Boolean(opts?.agentReviewsLoading);
    this.#agentReviewsError = opts?.agentReviewsError ?? null;
    this.#selectedAgentReviewVersion = opts?.selectedAgentReviewVersion ?? null;
    this.#selectedAgentReviewDocument = opts?.selectedAgentReviewDocument ?? null;
    this.#agentReviewStarting = Boolean(opts?.agentReviewStarting);
    if (opts?.filesViewMode) {
      this.#filesViewMode = opts.filesViewMode;
    }
    if (this.#contentTab === "agent_reviews" && this.#agentReviews.length === 0) {
      this.#contentTab = "conversation";
    }
    if (this.#filesTabActivePath && !detail?.files.some((file) => file.path === this.#filesTabActivePath)) {
      this.#filesTabActivePath = null;
    }
    this.#renderContent();
  }

  setVisible(visible: boolean): void {
    this.#el.hidden = !visible;
  }

  #renderContent(): void {
    clearChildren(this.#bodyEl);

    if (this.#loading) {
      this.#bodyEl.appendChild(h("div", { class: "pr-view-empty" }, ["Loading PR..."]));
      return;
    }

    if (this.#error) {
      this.#bodyEl.appendChild(h("div", { class: "pr-view-empty pr-view-error" }, [this.#error]));
      return;
    }

    if (!this.#detail) {
      this.#bodyEl.appendChild(h("div", { class: "pr-view-empty" }, ["Select a pull request"]));
      return;
    }

    const detail = this.#detail;

    const commitSelect = h("select", {
      class: "pr-view-commit-select",
      onchange: (event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        this.#callbacks.onSelectCommit(value ? value : null);
      },
    }) as HTMLSelectElement;

    commitSelect.appendChild(h("option", { value: "" }, ["All commits"]));
    for (const commit of detail.commits) {
      commitSelect.appendChild(
        h("option", { value: commit.sha }, [`${commit.shortSha} ${commit.messageHeadline}`])
      );
    }
    commitSelect.value = this.#selectedCommitSha ?? "";

    const panelContent = this.#contentTab === "files_changed"
      ? this.#renderFilesChangedPanel(detail)
      : this.#contentTab === "agent_reviews"
        ? this.#renderAgentReviewsPanel()
        : this.#renderConversationPanel(detail);

    const hasRunningAgentReview = this.#agentReviews.some((run) => run.status === "running");
    const isAgentReviewActionDisabled = this.#agentReviewStarting || hasRunningAgentReview;

    const card = h("div", { class: "pr-view-card" }, [
      h("div", { class: "pr-view-tabs-row" }, [
        this.#renderPanelTabs(detail),
        h("button", {
          class: "pr-view-agent-review-btn",
          type: "button",
          disabled: isAgentReviewActionDisabled,
          onclick: () => {
            if (isAgentReviewActionDisabled) return;
            this.#callbacks.onStartAgentReview?.();
          },
        }, [
          hasRunningAgentReview
            ? "Agent Review Running"
            : this.#agentReviewStarting
              ? "Starting..."
              : "Agent Review",
        ]),
      ]),
      h("header", { class: "pr-view-head" }, [
        h("a", {
          class: "pr-view-title",
          href: detail.url,
          target: "_blank",
          rel: "noopener noreferrer",
          title: detail.title,
          onclick: (event: Event) => {
            event.preventDefault();
            this.#callbacks.onOpenPullRequest(detail.url);
          },
        }, [detail.title]),
        h("div", { class: "pr-view-branch" }, [`${detail.baseRefName} <- ${detail.headRefName}`]),
      ]),
      h("div", { class: "pr-view-toolbar" }, [
        h("label", { class: "pr-view-toolbar-label" }, ["Commits"]),
        commitSelect,
      ]),
      h("hr", { class: "pr-view-divider" }),
      panelContent,
    ]);

    this.#bodyEl.appendChild(card);
  }

  #renderPanelTabs(detail: PullRequestDetail): HTMLElement {
    const tabs: Array<HTMLElement | null> = [
      h("button", {
        class: `pr-view-activity-tab${this.#contentTab === "conversation" ? " active" : ""}`,
        type: "button",
        onclick: () => this.#setContentTab("conversation"),
      }, [
        "Conversation",
        h("span", { class: "pr-view-activity-count" }, [String(detail.conversation.length)]),
      ]),
      h("button", {
        class: `pr-view-activity-tab${this.#contentTab === "files_changed" ? " active" : ""}`,
        type: "button",
        onclick: () => this.#setContentTab("files_changed"),
      }, [
        "Files changed",
        h("span", { class: "pr-view-activity-count" }, [String(detail.files.length)]),
      ]),
      this.#agentReviews.length > 0
        ? h("button", {
            class: `pr-view-activity-tab${this.#contentTab === "agent_reviews" ? " active" : ""}`,
            type: "button",
            onclick: () => this.#setContentTab("agent_reviews"),
          }, [
            "Agent reviews",
            h("span", { class: "pr-view-activity-count" }, [String(this.#agentReviews.length)]),
          ])
        : null,
    ];

    return h("div", { class: "pr-view-activity-tabs" }, tabs.filter(Boolean));
  }

  #setContentTab(next: "conversation" | "files_changed" | "agent_reviews"): void {
    if (this.#contentTab === next) return;
    this.#contentTab = next;
    this.#renderContent();
  }

  #setFilesViewMode(next: FileListView): void {
    if (this.#filesViewMode === next) return;
    this.#filesViewMode = next;
    if (next === "tree" && this.#filesTabActivePath) {
      this.#expandFilesTreeParents(this.#filesTabActivePath);
    }
    this.#callbacks.onFilesViewModeChange?.(next);
    this.#renderContent();
  }

  #renderConversationPanel(detail: PullRequestDetail): HTMLElement {
    const content: HTMLElement[] = [
      h("div", { class: "pr-view-meta-list" }, [
        metaRow("Repository", detail.repo),
        metaRow("Checks", buildChecksIndicator(detail.checks)),
        metaRow("Author", `@${detail.authorLogin}`),
        metaRow("Seen", `${this.#seenCount}/${this.#totalFiles} files`),
      ]),
    ];

    if (detail.warnings.length > 0) {
      content.push(
        h("div", { class: "pr-view-warnings" }, detail.warnings.map((warning) =>
          h("div", { class: "pr-view-warning" }, [warning])
        ))
      );
    }

    content.push(
      h("hr", { class: "pr-view-divider" }),
      h("section", { class: "pr-view-section" }, [
        h("h3", { class: "pr-view-section-title" }, ["PR Description"]),
        detail.body.trim()
          ? h("div", {
              class: "pr-view-description plugins-preview-markdown chat-bubble assistant",
              innerHTML: renderMarkdown(detail.body),
            })
          : h("div", { class: "pr-view-section-empty" }, ["No description"]),
      ]),
      h("hr", { class: "pr-view-divider" }),
      h("section", { class: "pr-view-section" }, [
        h("h3", { class: "pr-view-section-title" }, ["Conversation"]),
        this.#renderConversation(detail),
      ])
    );

    return h("div", { class: "pr-view-conversation-panel" }, content);
  }

  #renderConversation(detail: PullRequestDetail): HTMLElement {
    if (detail.conversation.length === 0) {
      return h("div", { class: "pr-view-timeline-empty" }, ["No conversation yet"]);
    }
    return h("div", { class: "pr-view-timeline" }, detail.conversation.map((item) =>
      this.#renderTimelineItem(item)
    ));
  }

  #renderAgentReviewsPanel(): HTMLElement {
    if (this.#agentReviews.length === 0) {
      return h("section", { class: "pr-view-section" }, [
        h("div", { class: "pr-view-section-empty" }, ["No agent reviews yet"]),
      ]);
    }

    const selectedVersion = this.#selectedAgentReviewVersion
      ?? this.#agentReviews[this.#agentReviews.length - 1]?.version
      ?? null;

    const list = h("div", { class: "pr-agent-reviews-list" });
    for (const run of this.#agentReviews) {
      const isActive = run.version === selectedVersion;
      const timestamp = run.completedAt ?? run.updatedAt ?? run.startedAt;
      list.appendChild(h("button", {
        class: `pr-agent-review-run${isActive ? " active" : ""}`,
        type: "button",
        onclick: () => {
          if (this.#selectedAgentReviewVersion === run.version) return;
          this.#selectedAgentReviewVersion = run.version;
          this.#callbacks.onSelectAgentReviewVersion?.(run.version);
          this.#renderContent();
        },
      }, [
        h("span", { class: "pr-agent-review-run-version" }, [`v${run.version}`]),
        h("span", { class: `pr-agent-review-run-status is-${run.status}` }, [
          formatAgentReviewStatus(run.status),
        ]),
        h("span", { class: "pr-agent-review-run-time" }, [
          formatDateTime(timestamp),
        ]),
      ]));
    }

    const selectedDocument = this.#selectedAgentReviewDocument;
    const review = selectedDocument?.review ?? null;
    const renderedMarkdown = selectedDocument?.renderedMarkdown ?? "";
    const parseError = selectedDocument?.parseError ?? null;
    const reviewVersion = selectedVersion ?? 1;
    const suggestions = review?.suggestions ?? [];

    const validActionKeys = new Set(suggestions.map((_item, index) => `${reviewVersion}:${index}`));
    for (const key of this.#applyingReviewIssues) {
      if (!validActionKeys.has(key)) {
        this.#applyingReviewIssues.delete(key);
      }
    }
    for (const key of this.#applyReviewIssueErrors.keys()) {
      if (!validActionKeys.has(key)) {
        this.#applyReviewIssueErrors.delete(key);
      }
    }

    const structuredPanel = review
      ? this.#renderStructuredAgentReview(reviewVersion, review, suggestions)
      : null;

    const content = this.#agentReviewsLoading && !selectedDocument
      ? h("div", { class: "pr-view-section-empty" }, ["Loading review..."])
      : this.#agentReviewsError
        ? h("div", { class: "pr-view-section-empty pr-view-error" }, [this.#agentReviewsError])
        : structuredPanel
          ? structuredPanel
          : renderedMarkdown.trim()
          ? h("div", {
              class: "pr-agent-reviews-markdown plugins-preview-markdown chat-bubble assistant",
              innerHTML: renderMarkdown(renderedMarkdown),
            })
          : h("div", { class: "pr-view-section-empty" }, ["Review file not found"]);

    return h("section", { class: "pr-view-section pr-agent-reviews-panel" }, [
      list,
      parseError
        ? h("div", { class: "pr-view-warning" }, [`Invalid review JSON: ${parseError}`])
        : null as any,
      content,
    ].filter(Boolean));
  }

  #renderStructuredAgentReview(
    reviewVersion: number,
    review: NonNullable<PullRequestAgentReviewDocument["review"]>,
    suggestions: NonNullable<PullRequestAgentReviewDocument["review"]>["suggestions"]
  ): HTMLElement {
    const metadataRows = Object.entries(review.metadata ?? {}).map(([key, value]) =>
      h("div", { class: "pr-agent-review-meta-row" }, [
        h("span", { class: "pr-agent-review-meta-key" }, [key.replace(/_/g, " ")]),
        h("span", { class: "pr-agent-review-meta-value", title: value }, [value]),
      ])
    );

    const suggestionsPanel = h("div", { class: "pr-agent-review-suggestions" }, suggestions.map((item, index) => {
      const itemKey = `${reviewVersion}:${index}`;
      const isApplying = this.#applyingReviewIssues.has(itemKey);
      const isApplied = item.applied;
      const errorMessage = this.#applyReviewIssueErrors.get(itemKey) ?? null;

      const actionButton = h("button", {
        class: `pr-agent-review-action-btn pr-agent-review-action-btn-inline${isApplied ? " is-applied" : ""}`,
        type: "button",
        disabled: isApplying || isApplied,
        onclick: async () => {
          if (isApplying || isApplied) return;
          this.#applyingReviewIssues.add(itemKey);
          this.#applyReviewIssueErrors.delete(itemKey);
          this.#renderContent();
          try {
            await this.#callbacks.onApplyAgentReviewIssue?.({
              reviewVersion,
              suggestionIndex: index,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.#applyReviewIssueErrors.set(
              itemKey,
              message.trim() || "Failed to apply suggestion"
            );
          } finally {
            this.#applyingReviewIssues.delete(itemKey);
            this.#renderContent();
          }
        },
      }, [
        isApplying
          ? "Applying..."
          : isApplied
            ? "Applied"
            : "Apply",
      ]);

      return h("section", { class: "pr-agent-review-suggestion" }, [
        h("div", { class: "pr-agent-review-suggestion-head" }, [
          h("h3", { class: "pr-agent-review-suggestion-title" }, [`Suggestion ${index + 1}`]),
          h("span", { class: `pr-agent-review-level-badge is-${normalizeReviewLevelClass(item.level)}` }, [item.level]),
        ]),
        actionButton,
        h("div", {
          class: "pr-agent-review-suggestion-body plugins-preview-markdown chat-bubble assistant",
          innerHTML: renderMarkdown(item.content || "_No details_"),
        }),
        errorMessage
          ? h("div", { class: "pr-agent-review-action-error" }, [errorMessage])
          : null as any,
      ].filter(Boolean));
    }));

    return h("div", { class: "pr-agent-review-structured" }, [
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["Metadata"]),
        metadataRows.length > 0
          ? h("div", { class: "pr-agent-review-metadata-list" }, metadataRows)
          : h("div", { class: "pr-view-section-empty" }, ["No metadata"]),
      ]),
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["PR Summary"]),
        h("div", {
          class: "pr-agent-reviews-markdown plugins-preview-markdown chat-bubble assistant",
          innerHTML: renderMarkdown(review.pr_summary || "_No summary_"),
        }),
      ]),
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["Strengths"]),
        h("div", {
          class: "pr-agent-reviews-markdown plugins-preview-markdown chat-bubble assistant",
          innerHTML: renderMarkdown(review.strengths || "_No strengths_"),
        }),
      ]),
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["Improvements"]),
        h("div", {
          class: "pr-agent-reviews-markdown plugins-preview-markdown chat-bubble assistant",
          innerHTML: renderMarkdown(review.improvements || "_No improvements_"),
        }),
      ]),
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["Suggestions"]),
        suggestions.length > 0
          ? suggestionsPanel
          : h("div", { class: "pr-view-section-empty" }, ["No suggestions"]),
      ]),
      h("section", { class: "pr-agent-review-block" }, [
        h("h3", { class: "pr-view-section-title" }, ["Final Veredic"]),
        h("div", {
          class: "pr-agent-reviews-markdown plugins-preview-markdown chat-bubble assistant",
          innerHTML: renderMarkdown(review.final_veredic || "_No final veredic_"),
        }),
      ]),
    ]);
  }

  #renderFilesChangedPanel(detail: PullRequestDetail): HTMLElement {
    return h("section", { class: "pr-view-section pr-view-files-panel" }, [
      h("div", { class: "files-panel pr-view-files-changed-panel" }, [
        h("div", { class: "fp-header" }, [
          h("div", { class: "fp-header-left" }, [
            h("span", { class: "fp-title" }, ["Files Changed"]),
            h("span", { class: "fp-count" }, [String(detail.files.length)]),
          ]),
          h("div", { class: "fp-header-controls" }, [
            h("div", { class: "fp-view-toggle" }, [
              h("button", {
                class: `fp-view-btn${this.#filesViewMode === "flat" ? " active" : ""}`,
                type: "button",
                onclick: () => this.#setFilesViewMode("flat"),
              }, ["Flat"]),
              h("button", {
                class: `fp-view-btn${this.#filesViewMode === "tree" ? " active" : ""}`,
                type: "button",
                onclick: () => this.#setFilesViewMode("tree"),
              }, ["Tree"]),
            ]),
          ]),
        ]),
        this.#renderFilesChanged(detail),
      ]),
    ]);
  }

  #renderFilesChanged(detail: PullRequestDetail): HTMLElement {
    if (detail.files.length === 0) {
      return h("div", { class: "fp-list" }, [
        h("div", { class: "fp-empty" }, ["No changed files"]),
      ]);
    }

    if (this.#filesViewMode === "tree") {
      return this.#renderFilesChangedTree(detail.files);
    }

    return this.#renderFilesChangedFlat(detail.files);
  }

  #renderFilesChangedFlat(files: PRFileRow[]): HTMLElement {
    const list = h("div", { class: "fp-list" });
    for (const file of files) {
      list.appendChild(this.#renderFilesChangedFileRow(file, { depth: 0, showDir: true }));
    }
    return list;
  }

  #renderFilesChangedTree(files: PRFileRow[]): HTMLElement {
    const root = buildPRFileTree(files);
    const validDirs = new Set<string>();
    collectPRTreePaths(root, validDirs);
    for (const path of this.#filesTreeExpanded.keys()) {
      if (!validDirs.has(path)) {
        this.#filesTreeExpanded.delete(path);
      }
    }
    if (this.#filesTabActivePath) {
      this.#expandFilesTreeParents(this.#filesTabActivePath);
    }

    const list = h("div", { class: "fp-list" });
    this.#appendTreeRows(root, list, 0);
    return list;
  }

  #appendTreeRows(node: PRFileTreeNode, parent: HTMLElement, depth: number): void {
    const directories = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));

    for (const dir of directories) {
      const isOpen = this.#isTreeFolderOpen(dir.path, depth);
      parent.appendChild(h("button", {
        class: `fp-folder-row${isOpen ? " open" : ""}`,
        type: "button",
        style: {
          paddingLeft: `${10 + (depth * 14)}px`,
        },
        title: dir.path,
        onclick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          this.#filesTreeExpanded.set(dir.path, !isOpen);
          this.#renderContent();
        },
      }, [
        h("span", { class: "fp-folder-caret", "aria-hidden": "true" }, ["\u25B8"]),
        h("span", { class: "fp-folder-name" }, [dir.name]),
        h("span", { class: "fp-folder-count" }, [String(countPRTreeFiles(dir))]),
      ]));

      if (isOpen) {
        this.#appendTreeRows(dir, parent, depth + 1);
      }
    }

    for (const file of files) {
      parent.appendChild(this.#renderFilesChangedFileRow(file, { depth, showDir: false }));
    }
  }

  #isTreeFolderOpen(path: string, depth: number): boolean {
    const current = this.#filesTreeExpanded.get(path);
    if (current != null) return current;
    const defaultOpen = depth === 0;
    this.#filesTreeExpanded.set(path, defaultOpen);
    return defaultOpen;
  }

  #expandFilesTreeParents(path: string): void {
    const segments = path.split("/");
    if (segments.length <= 1) return;
    let current = "";
    for (let i = 0; i < segments.length - 1; i++) {
      current = current ? `${current}/${segments[i]}` : segments[i];
      this.#filesTreeExpanded.set(current, true);
    }
  }

  #renderFilesChangedFileRow(
    file: PRFileRow,
    opts: { depth: number; showDir: boolean }
  ): HTMLElement {
    const review = this.#fileReviewState.get(file.path);
    const isSeen = review?.seen ?? false;
    const attention = review?.attention ?? null;
    const statusIcon = statusSymbolForFile(file.status);
    const fileName = file.path.split("/").pop() ?? file.path;
    const dirPath = file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : "";

    return h("div", {
      class: `fp-file-item${this.#filesTabActivePath === file.path ? " active" : ""}${isSeen ? " seen" : ""}${attention ? ` attention-${attention}` : ""}`,
      style: { paddingLeft: `${10 + (opts.depth * 14)}px` },
      onclick: () => {
        this.#filesTabActivePath = file.path;
        if (this.#filesViewMode === "tree") {
          this.#expandFilesTreeParents(file.path);
        }
        this.#callbacks.onSelectFile(file.path);
        this.#renderContent();
      },
    }, [
      h("span", { class: `fp-status fp-status-${file.status}` }, [statusIcon]),
      h("div", { class: "fp-file-info" }, [
        h("div", { class: "fp-file-name-row" }, [
          h("span", { class: "fp-file-name", title: fileName }, [fileName]),
          h("span", { class: "fp-file-delta" }, [
            h("span", { class: "fp-delta-add" }, [`+${file.additions}`]),
            h("span", { class: "fp-delta-del" }, [`-${file.deletions}`]),
          ]),
          isSeen
            ? h("span", { class: "fp-review-chip fp-review-chip-seen" }, ["Seen"])
            : null as any,
          attention
            ? h("span", { class: `fp-review-chip fp-review-chip-${attention}` }, [
                attention === "new" ? "New" : "Updated",
              ])
            : null as any,
        ].filter(Boolean)),
        opts.showDir && dirPath
          ? h("span", { class: "fp-file-dir", title: dirPath }, [dirPath])
          : null as any,
      ]),
      this.#callbacks.onToggleFileSeen
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
    ].filter(Boolean));
  }

  #renderTimelineItem(item: PullRequestConversationItem): HTMLElement {
    if (item.kind === "issue_comment") {
      return h("article", { class: "pr-timeline-item" }, [
        h("div", { class: "pr-timeline-head" }, [
          h("span", { class: "pr-timeline-kind" }, ["Comment"]),
          h("span", { class: "pr-timeline-author" }, [`@${item.authorLogin}`]),
          h("span", { class: "pr-timeline-time" }, [formatDateTime(item.createdAt)]),
        ]),
        h("div", {
          class: "pr-timeline-body chat-bubble assistant",
          innerHTML: renderMarkdown(item.body || "_No content_"),
        }),
      ]);
    }

    if (item.kind === "review") {
      return h("article", { class: "pr-timeline-item" }, [
        h("div", { class: "pr-timeline-head" }, [
          h("span", { class: "pr-timeline-kind" }, [`Review · ${item.state}`]),
          h("span", { class: "pr-timeline-author" }, [`@${item.authorLogin}`]),
          h("span", { class: "pr-timeline-time" }, [formatDateTime(item.createdAt)]),
        ]),
        item.body.trim()
          ? h("div", {
              class: "pr-timeline-body chat-bubble assistant",
              innerHTML: renderMarkdown(item.body),
            })
          : h("div", { class: "pr-timeline-empty-body" }, ["No review body"]),
      ]);
    }

    const threadTitle = item.line != null
      ? `${item.path}:${item.line}`
      : item.path;

    const thread = h("article", { class: "pr-timeline-item pr-thread-item" }, [
      h("div", { class: "pr-timeline-head" }, [
        h("span", { class: "pr-timeline-kind" }, ["Review thread"]),
        h("span", { class: "pr-timeline-file" }, [threadTitle]),
        h("span", { class: "pr-timeline-time" }, [formatDateTime(item.createdAt)]),
      ]),
    ]);

    for (const comment of item.comments) {
      thread.appendChild(
        h("div", { class: "pr-thread-comment" }, [
          h("div", { class: "pr-thread-comment-head" }, [
            h("span", { class: "pr-thread-comment-author" }, [`@${comment.authorLogin}`]),
            h("span", { class: "pr-thread-comment-time" }, [formatDateTime(comment.createdAt)]),
          ]),
          h("div", {
            class: "pr-thread-comment-body chat-bubble assistant",
            innerHTML: renderMarkdown(comment.body || "_No content_"),
          }),
        ])
      );
    }

    return thread;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function metaRow(label: string, value: string | HTMLElement): HTMLElement {
  const valueElement = h("span", { class: "pr-view-meta-value" });
  if (typeof value === "string") {
    valueElement.classList.add("pr-view-meta-value-text");
    valueElement.title = value;
    valueElement.appendChild(document.createTextNode(value));
  } else {
    valueElement.appendChild(value);
  }

  return h("div", { class: "pr-view-meta-row" }, [
    h("span", { class: "pr-view-meta-label" }, [`${label}:`]),
    valueElement,
  ]);
}

type CheckAggregateState = "success" | "failure" | "running" | "neutral";

function buildChecksIndicator(checks: PullRequestDetail["checks"]): HTMLElement {
  const aggregate = aggregateCheckState(checks);
  const indicator = h("span", {
    class: "pr-check-indicator",
    tabindex: 0,
    "aria-label": checks.length > 0 ? summarizeChecks(checks) : "No checks",
  }, [
    h("span", {
      class: `pr-check-indicator-icon pr-check-state-${aggregate}`,
      "aria-hidden": "true",
      innerHTML: checkStateIconSvg(aggregate),
    }),
  ]);

  if (checks.length === 0) {
    return indicator;
  }

  const tooltip = h("div", { class: "pr-check-tooltip", role: "tooltip" }, [
    h("div", { class: "pr-check-tooltip-summary" }, [summarizeChecks(checks)]),
  ]);
  for (const check of checks) {
    const statusLabel = check.conclusion ?? check.status;
    const checkName = check.workflowName ? `${check.workflowName} / ${check.name}` : check.name;
    tooltip.appendChild(h("div", { class: "pr-check-tooltip-item" }, [
      h("span", { class: "pr-check-tooltip-name", title: checkName }, [checkName]),
      h("span", { class: `pr-check-tooltip-status pr-check-${normalizeCheckClass(statusLabel)}` }, [statusLabel]),
    ]));
  }
  indicator.appendChild(tooltip);

  return indicator;
}

function summarizeChecks(checks: PullRequestDetail["checks"]): string {
  if (checks.length === 0) return "No checks";

  let success = 0;
  let failed = 0;
  let running = 0;

  for (const check of checks) {
    const status = String(check.status ?? "").toUpperCase();
    const conclusion = String(check.conclusion ?? "").toUpperCase();

    if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING") {
      running++;
      continue;
    }

    if (conclusion === "SUCCESS") {
      success++;
      continue;
    }

    if (conclusion === "FAILURE" || conclusion === "TIMED_OUT" || conclusion === "CANCELLED") {
      failed++;
      continue;
    }

    if (!conclusion) {
      running++;
      continue;
    }

    success++;
  }

  return `${success} passed · ${running} running · ${failed} failed`;
}

function normalizeCheckClass(value: string): string {
  const status = String(value ?? "").toLowerCase();
  if (status.includes("success")) return "success";
  if (status.includes("fail") || status.includes("cancel") || status.includes("timed")) return "failure";
  if (status.includes("progress") || status.includes("pending") || status.includes("queued")) return "running";
  return "neutral";
}

function aggregateCheckState(checks: PullRequestDetail["checks"]): CheckAggregateState {
  if (checks.length === 0) return "neutral";

  let running = false;
  for (const check of checks) {
    const status = String(check.status ?? "").toUpperCase();
    const conclusion = String(check.conclusion ?? "").toUpperCase();

    if (
      conclusion === "FAILURE"
      || conclusion === "TIMED_OUT"
      || conclusion === "CANCELLED"
      || conclusion === "STARTUP_FAILURE"
      || conclusion === "ACTION_REQUIRED"
    ) {
      return "failure";
    }

    if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING" || !conclusion) {
      running = true;
    }
  }

  return running ? "running" : "success";
}

function checkStateIconSvg(state: CheckAggregateState): string {
  if (state === "success") {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M6.5 10.4l2.3 2.4l4.7 -5"/></svg>';
  }
  if (state === "failure") {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M7 7l6 6"/><path d="M13 7l-6 6"/></svg>';
  }
  if (state === "running") {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.8v4.6"/><path d="M10 10.4l2.8 1.7"/></svg>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/></svg>';
}

function statusSymbolForFile(
  status: PullRequestDetail["files"][number]["status"]
): string {
  if (status === "added") return "+";
  if (status === "deleted") return "\u2212";
  if (status === "renamed") return "R";
  return "\u2219";
}

function buildPRFileTree(files: PRFileRow[]): PRFileTreeNode {
  const root: PRFileTreeNode = {
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

function collectPRTreePaths(node: PRFileTreeNode, out: Set<string>): void {
  for (const child of node.dirs.values()) {
    out.add(child.path);
    collectPRTreePaths(child, out);
  }
}

function countPRTreeFiles(node: PRFileTreeNode): number {
  let total = node.files.length;
  for (const child of node.dirs.values()) {
    total += countPRTreeFiles(child);
  }
  return total;
}

function formatAgentReviewStatus(status: PullRequestAgentReviewRun["status"]): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "stale") return "Stale";
  return "Failed";
}

function normalizeReviewLevelClass(level: PullRequestAgentReviewLevel): string {
  if (level === "Critical") return "critical";
  if (level === "Important") return "important";
  if (level === "Medium") return "medium";
  return "low";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "";

  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
