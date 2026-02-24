import { clearChildren, h } from "../lib/dom.ts";
import type {
  TaskAction,
  TaskCardDetail,
  TaskCardStatus,
  TaskSourceKind,
} from "../../shared/types.ts";

type TaskPatch = {
  title?: string;
  notes?: string;
  status?: TaskCardStatus;
  planMarkdown?: string | null;
};

type TaskSourcePatch = {
  title?: string | null;
  content?: string | null;
  url?: string | null;
};

export type TasksViewCallbacks = {
  onUpdateTask: (taskId: string, patch: TaskPatch) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddSource: (
    taskId: string,
    payload: {
      kind: TaskSourceKind;
      url?: string | null;
      content?: string | null;
    }
  ) => Promise<void>;
  onUpdateSource: (sourceId: string, patch: TaskSourcePatch) => Promise<void>;
  onRemoveSource: (sourceId: string) => Promise<void>;
  onFetchSource: (sourceId: string) => Promise<void>;
  onRunAction: (taskId: string, action: TaskAction) => Promise<void>;
};

export class TasksView {
  #el: HTMLElement;
  #bodyEl: HTMLElement;
  #callbacks: TasksViewCallbacks;
  #detail: TaskCardDetail | null = null;
  #loading = false;
  #lastRenderedDetail: TaskCardDetail | null = null;
  #lastRenderedLoading = false;
  #taskPatchQueue = new Map<string, TaskPatch>();
  #taskPatchTimer = new Map<string, ReturnType<typeof setTimeout>>();
  #sourcePatchQueue = new Map<string, TaskSourcePatch>();
  #sourcePatchTimer = new Map<string, ReturnType<typeof setTimeout>>();
  #actionInFlight = new Set<string>();
  #lastError: string | null = null;
  #pendingImproveByTask = new Map<string, {
    runId: string;
    proposal: string;
    originalNotes: string;
  }>();
  #dismissedImproveRunIds = new Set<string>();
  #taskDrafts = new Map<string, {
    title?: string;
    notes?: string;
    planMarkdown?: string | null;
  }>();
  #sourceDrafts = new Map<string, {
    title?: string | null;
    content?: string | null;
    url?: string | null;
  }>();

  constructor(container: HTMLElement, callbacks: TasksViewCallbacks) {
    this.#callbacks = callbacks;

    this.#bodyEl = h("div", { class: "tasks-view-body" });
    this.#el = h("section", { class: "tasks-view", hidden: true }, [
      this.#bodyEl,
    ]);

    container.appendChild(this.#el);
  }

  render(detail: TaskCardDetail | null, opts?: { loading?: boolean }): void {
    const nextLoading = Boolean(opts?.loading);
    if (detail === this.#lastRenderedDetail && nextLoading === this.#lastRenderedLoading) {
      this.#detail = detail;
      this.#loading = nextLoading;
      return;
    }

    const prevTaskId = this.#detail?.id ?? null;
    const nextTaskId = detail?.id ?? null;
    if (prevTaskId !== nextTaskId) {
      this.#taskDrafts.clear();
      this.#sourceDrafts.clear();
      this.#lastError = null;
    }

    this.#detail = detail;
    this.#loading = nextLoading;
    this.#lastRenderedDetail = detail;
    this.#lastRenderedLoading = nextLoading;
    this.#renderContent();
  }

  setVisible(visible: boolean): void {
    this.#el.hidden = !visible;
  }

  #renderContent(): void {
    const focusSnapshot = captureFocus(this.#bodyEl);
    clearChildren(this.#bodyEl);

    if (this.#loading) {
      this.#bodyEl.appendChild(
        h("div", { class: "tasks-view-empty" }, ["Loading task..."])
      );
      return;
    }

    if (!this.#detail) {
      this.#bodyEl.appendChild(
        h("div", { class: "tasks-view-empty" }, ["Select or create a task"])
      );
      return;
    }

    const task = this.#detail;
    this.#syncPendingImprove(task);

    const pendingImprove = this.#pendingImproveByTask.get(task.id) ?? null;
    const taskDraft = this.#taskDrafts.get(task.id);
    const runningAction = task.lastRun?.status === "running"
      ? task.lastRun.action
      : null;
    const isTaskBusy = Boolean(runningAction) || this.#hasActionInFlight(task.id);
    const bannerError = this.#lastError
      ?? (
        task.lastRun?.status === "failed"
          ? (task.lastRun.error ?? "Task action failed")
          : null
      );

    const titleInput = h("input", {
      class: "tasks-input",
      type: "text",
      value: taskDraft?.title ?? task.title,
      "data-focus-id": `task:${task.id}:title`,
      placeholder: "Task title",
      oninput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value;
        this.#setTaskDraft(task.id, { title: value });
        this.#queueTaskPatch(task.id, { title: value });
      },
      onblur: () => this.#clearTaskDraftFields(task.id, ["title"]),
    }) as HTMLInputElement;

    const notesInput = h("textarea", {
      class: "tasks-textarea",
      rows: 8,
      "data-focus-id": `task:${task.id}:notes`,
      placeholder: "Task notes",
      oninput: (event: Event) => {
        const value = (event.target as HTMLTextAreaElement).value;
        this.#setTaskDraft(task.id, { notes: value });
        this.#queueTaskPatch(task.id, { notes: value });
      },
      onblur: () => this.#clearTaskDraftFields(task.id, ["notes"]),
    }) as HTMLTextAreaElement;
    notesInput.value = taskDraft?.notes ?? task.notes;

    const planInput = h("textarea", {
      class: "tasks-textarea tasks-plan-textarea",
      rows: 8,
      "data-focus-id": `task:${task.id}:plan`,
      placeholder: "Plan markdown",
      oninput: (event: Event) => {
        const value = (event.target as HTMLTextAreaElement).value;
        this.#setTaskDraft(task.id, { planMarkdown: value || null });
        this.#queueTaskPatch(task.id, { planMarkdown: value || null });
      },
      onblur: () => this.#clearTaskDraftFields(task.id, ["planMarkdown"]),
    }) as HTMLTextAreaElement;
    planInput.value = taskDraft?.planMarkdown ?? task.planMarkdown ?? "";

    const sourceUrlInput = h("input", {
      class: "tasks-input",
      type: "url",
      "data-focus-id": `task:${task.id}:source-create-url`,
      placeholder: "https://jira... or https://slack...",
    }) as HTMLInputElement;

    const sources = h("div", { class: "tasks-sources" });
    if (task.sources.length === 0) {
      sources.appendChild(h("div", { class: "tasks-sources-empty" }, ["No sources"]));
    } else {
      for (const source of task.sources) {
        sources.appendChild(this.#renderSourceCard(source.id, task.id, {
          kind: source.kind,
          url: source.url,
          title: source.title,
          content: source.content,
          fetchStatus: source.fetchStatus,
          httpStatus: source.httpStatus,
          error: source.error,
        }));
      }
    }

    const actions = h("div", { class: "tasks-action-row" }, [
      this.#actionButton(
        task,
        "improve",
        "Improve Task",
        isTaskBusy,
        runningAction
      ),
      this.#actionButton(
        task,
        "plan",
        "Plan Task",
        isTaskBusy,
        runningAction
      ),
      this.#actionButton(
        task,
        "execute",
        "Execute Task",
        isTaskBusy,
        runningAction
      ),
      h("button", {
        class: "tasks-btn tasks-btn-danger",
        disabled: isTaskBusy,
        onclick: async () => {
          await this.#callbacks.onDeleteTask(task.id);
        },
      }, ["Delete Task"]),
    ]);

    this.#bodyEl.appendChild(
      h("div", { class: "tasks-card" }, [
        bannerError
          ? h("div", { class: "tasks-error-banner" }, [bannerError])
          : h("div", { class: "tasks-error-banner", hidden: true }),
        h("div", { class: "tasks-card-header" }, [
          h("span", { class: `tasks-status tasks-status-${task.status}` }, [task.status]),
          h("span", { class: "tasks-updated" }, [`Updated ${timeAgo(task.updatedAt)}`]),
        ]),
        h("div", { class: "tasks-field" }, [
          h("label", { class: "tasks-label" }, ["Title"]),
          titleInput,
        ]),
        h("div", { class: "tasks-field" }, [
          h("label", { class: "tasks-label" }, ["Notes"]),
          notesInput,
        ]),
        pendingImprove
          ? h("div", { class: "tasks-field tasks-improve-proposal" }, [
              h("label", { class: "tasks-label" }, ["Improve Preview"]),
              h("div", { class: "tasks-run-status" }, [
                "Notes shows Claude's improved text. Accept to save or Discard to restore original.",
              ]),
              h("div", { class: "tasks-source-actions" }, [
                h("button", {
                  class: "tasks-btn tasks-btn-primary",
                  disabled: isTaskBusy,
                  onclick: async () => {
                    await this.#flushTaskPatch(task.id);
                    try {
                      await this.#callbacks.onUpdateTask(task.id, {
                        notes: pendingImprove.proposal,
                      });
                      this.#dismissedImproveRunIds.add(pendingImprove.runId);
                      this.#pendingImproveByTask.delete(task.id);
                      this.#taskDrafts.delete(task.id);
                      this.#lastError = null;
                    } catch (err) {
                      const message = err instanceof Error ? err.message : String(err);
                      this.#lastError = message || "Failed to accept improve proposal";
                    } finally {
                      this.#renderContent();
                    }
                  },
                }, ["Accept"]),
                h("button", {
                  class: "tasks-btn",
                  disabled: isTaskBusy,
                  onclick: () => {
                    this.#dismissedImproveRunIds.add(pendingImprove.runId);
                    this.#pendingImproveByTask.delete(task.id);
                    this.#setTaskDraft(task.id, { notes: pendingImprove.originalNotes });
                    this.#renderContent();
                  },
                }, ["Discard"]),
              ]),
            ])
          : h("div", { hidden: true }),
        h("div", { class: "tasks-field" }, [
          h("label", { class: "tasks-label" }, ["Plan"]),
          planInput,
        ]),
        h("div", { class: "tasks-field" }, [
          h("label", { class: "tasks-label" }, ["Sources"]),
          h("div", { class: "tasks-source-create" }, [
            sourceUrlInput,
            h("button", {
              class: "tasks-btn",
              onclick: async () => {
                const url = sourceUrlInput.value.trim();
                if (!url) return;
                sourceUrlInput.value = "";
                await this.#callbacks.onAddSource(task.id, {
                  kind: "url",
                  url,
                  content: null,
                });
              },
            }, ["Add URL"]),
            h("button", {
              class: "tasks-btn",
              onclick: async () => {
                await this.#callbacks.onAddSource(task.id, {
                  kind: "manual",
                  content: "",
                });
              },
            }, ["Add Manual"]),
          ]),
          sources,
        ]),
        runningAction
          ? h("div", { class: "tasks-run-status" }, [formatRunningAction(runningAction)])
          : h("div", { class: "tasks-run-status", hidden: true }),
        actions,
      ])
    );

    restoreFocus(this.#bodyEl, focusSnapshot);
  }

  #renderSourceCard(
    sourceId: string,
    taskId: string,
    source: {
      kind: TaskSourceKind;
      url: string | null;
      title: string | null;
      content: string | null;
      fetchStatus: string;
      httpStatus: number | null;
      error: string | null;
    }
  ): HTMLElement {
    const urlInput = h("input", {
      class: "tasks-input tasks-source-url",
      type: "url",
      "data-focus-id": `source:${sourceId}:url`,
      placeholder: "Source URL",
      value: this.#sourceDrafts.get(sourceId)?.url ?? source.url ?? "",
      oninput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value;
        this.#setSourceDraft(sourceId, { url: value });
        this.#queueSourcePatch(sourceId, {
          url: value,
        });
      },
      onblur: () => this.#clearSourceDraftFields(sourceId, ["url"]),
    }) as HTMLInputElement;

    const titleInput = h("input", {
      class: "tasks-input",
      type: "text",
      "data-focus-id": `source:${sourceId}:title`,
      placeholder: "Source title",
      value: this.#sourceDrafts.get(sourceId)?.title ?? source.title ?? "",
      oninput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value;
        this.#setSourceDraft(sourceId, { title: value });
        this.#queueSourcePatch(sourceId, {
          title: value,
        });
      },
      onblur: () => this.#clearSourceDraftFields(sourceId, ["title"]),
    }) as HTMLInputElement;

    const contentInput = h("textarea", {
      class: "tasks-textarea tasks-source-content",
      rows: 6,
      "data-focus-id": `source:${sourceId}:content`,
      placeholder: "Source content",
      oninput: (event: Event) => {
        const value = (event.target as HTMLTextAreaElement).value;
        this.#setSourceDraft(sourceId, { content: value });
        this.#queueSourcePatch(sourceId, {
          content: value,
        });
      },
      onblur: () => this.#clearSourceDraftFields(sourceId, ["content"]),
    }) as HTMLTextAreaElement;
    contentInput.value = this.#sourceDrafts.get(sourceId)?.content ?? source.content ?? "";

    const fetchLabel = source.httpStatus
      ? `${source.fetchStatus} (${source.httpStatus})`
      : source.fetchStatus;

    return h("div", { class: "tasks-source-card" }, [
      h("div", { class: "tasks-source-head" }, [
        h("span", { class: "tasks-source-kind" }, [source.kind]),
        h("span", { class: `tasks-source-status tasks-source-status-${source.fetchStatus}` }, [fetchLabel]),
      ]),
      h("div", { class: "tasks-source-grid" }, [
        urlInput,
        titleInput,
      ]),
      contentInput,
      source.error
        ? h("div", { class: "tasks-source-error" }, [source.error])
        : h("div", { class: "tasks-source-error", hidden: true }),
      h("div", { class: "tasks-source-actions" }, [
        h("button", {
          class: "tasks-btn",
          onclick: async () => {
            await this.#flushSourcePatch(sourceId);
            await this.#callbacks.onFetchSource(sourceId);
          },
        }, ["Fetch"]),
        h("button", {
          class: "tasks-btn tasks-btn-danger",
          onclick: async () => {
            await this.#flushSourcePatch(sourceId);
            await this.#callbacks.onRemoveSource(sourceId);
          },
        }, ["Remove"]),
      ]),
    ]);
  }

  #actionButton(
    task: TaskCardDetail,
    action: TaskAction,
    label: string,
    disabled: boolean,
    runningAction: TaskAction | null
  ): HTMLElement {
    const taskId = task.id;
    const key = `${taskId}:${action}`;
    const busy = this.#actionInFlight.has(key);
    const runBusy = runningAction === action;
    const busyLabel = action === "improve"
      ? "Improving..."
      : action === "plan"
        ? "Planning..."
        : "Executing...";

    return h("button", {
      class: "tasks-btn tasks-btn-primary",
      disabled: disabled || busy || runBusy,
      onclick: async () => {
        if (this.#actionInFlight.has(key)) return;
        this.#actionInFlight.add(key);
        this.#renderContent();
        try {
          await this.#flushTaskPatch(taskId);
          this.#taskDrafts.delete(taskId);
          await this.#callbacks.onRunAction(taskId, action);
          this.#lastError = null;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.#lastError = message || "Action failed";
        } finally {
          this.#actionInFlight.delete(key);
          this.#renderContent();
        }
      },
    }, [busy || runBusy ? busyLabel : label]);
  }

  #queueTaskPatch(taskId: string, patch: TaskPatch): void {
    const prev = this.#taskPatchQueue.get(taskId) ?? {};
    this.#taskPatchQueue.set(taskId, {
      ...prev,
      ...patch,
    });

    const prevTimer = this.#taskPatchTimer.get(taskId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
      void this.#flushTaskPatch(taskId);
    }, 500);
    this.#taskPatchTimer.set(taskId, timer);
  }

  async #flushTaskPatch(taskId: string): Promise<void> {
    const pending = this.#taskPatchQueue.get(taskId);
    if (!pending) return;

    const timer = this.#taskPatchTimer.get(taskId);
    if (timer) clearTimeout(timer);

    this.#taskPatchTimer.delete(taskId);
    this.#taskPatchQueue.delete(taskId);
    await this.#callbacks.onUpdateTask(taskId, pending);
    this.#clearTaskDraftIfSynced(taskId, pending);
  }

  #queueSourcePatch(sourceId: string, patch: TaskSourcePatch): void {
    const prev = this.#sourcePatchQueue.get(sourceId) ?? {};
    this.#sourcePatchQueue.set(sourceId, {
      ...prev,
      ...patch,
    });

    const prevTimer = this.#sourcePatchTimer.get(sourceId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
      void this.#flushSourcePatch(sourceId);
    }, 500);
    this.#sourcePatchTimer.set(sourceId, timer);
  }

  async #flushSourcePatch(sourceId: string): Promise<void> {
    const pending = this.#sourcePatchQueue.get(sourceId);
    if (!pending) return;

    const timer = this.#sourcePatchTimer.get(sourceId);
    if (timer) clearTimeout(timer);

    this.#sourcePatchTimer.delete(sourceId);
    this.#sourcePatchQueue.delete(sourceId);
    await this.#callbacks.onUpdateSource(sourceId, pending);
    this.#clearSourceDraftIfSynced(sourceId, pending);
  }

  #setTaskDraft(taskId: string, draft: {
    title?: string;
    notes?: string;
    planMarkdown?: string | null;
  }): void {
    const prev = this.#taskDrafts.get(taskId) ?? {};
    this.#taskDrafts.set(taskId, { ...prev, ...draft });
  }

  #setSourceDraft(sourceId: string, draft: {
    title?: string | null;
    content?: string | null;
    url?: string | null;
  }): void {
    const prev = this.#sourceDrafts.get(sourceId) ?? {};
    this.#sourceDrafts.set(sourceId, { ...prev, ...draft });
  }

  #clearTaskDraftFields(taskId: string, fields: Array<"title" | "notes" | "planMarkdown">): void {
    const draft = this.#taskDrafts.get(taskId);
    if (!draft) return;
    for (const field of fields) {
      delete (draft as any)[field];
    }
    if (!Object.keys(draft).length) {
      this.#taskDrafts.delete(taskId);
      return;
    }
    this.#taskDrafts.set(taskId, draft);
  }

  #clearSourceDraftFields(sourceId: string, fields: Array<"title" | "content" | "url">): void {
    const draft = this.#sourceDrafts.get(sourceId);
    if (!draft) return;
    for (const field of fields) {
      delete (draft as any)[field];
    }
    if (!Object.keys(draft).length) {
      this.#sourceDrafts.delete(sourceId);
      return;
    }
    this.#sourceDrafts.set(sourceId, draft);
  }

  #clearTaskDraftIfSynced(taskId: string, patch: TaskPatch): void {
    const draft = this.#taskDrafts.get(taskId);
    if (!draft) return;

    if (patch.title !== undefined && draft.title === patch.title) delete draft.title;
    if (patch.notes !== undefined && draft.notes === patch.notes) delete draft.notes;
    if (patch.planMarkdown !== undefined && draft.planMarkdown === patch.planMarkdown) {
      delete draft.planMarkdown;
    }

    if (!Object.keys(draft).length) {
      this.#taskDrafts.delete(taskId);
      return;
    }
    this.#taskDrafts.set(taskId, draft);
  }

  #clearSourceDraftIfSynced(sourceId: string, patch: TaskSourcePatch): void {
    const draft = this.#sourceDrafts.get(sourceId);
    if (!draft) return;

    if (patch.url !== undefined && draft.url === patch.url) delete draft.url;
    if (patch.title !== undefined && draft.title === patch.title) delete draft.title;
    if (patch.content !== undefined && draft.content === patch.content) delete draft.content;

    if (!Object.keys(draft).length) {
      this.#sourceDrafts.delete(sourceId);
      return;
    }
    this.#sourceDrafts.set(sourceId, draft);
  }

  #syncPendingImprove(task: TaskCardDetail): void {
    const run = task.lastRun;
    if (
      !run
      || run.action !== "improve"
      || run.status !== "completed"
      || !hasText(run.output)
      || this.#dismissedImproveRunIds.has(run.id)
    ) {
      return;
    }

    const pending = this.#pendingImproveByTask.get(task.id);
    if (pending?.runId === run.id) return;

    this.#pendingImproveByTask.set(task.id, {
      runId: run.id,
      proposal: String(run.output ?? ""),
      originalNotes: task.notes,
    });
    this.#setTaskDraft(task.id, { notes: String(run.output ?? "") });
  }

  #hasActionInFlight(taskId: string): boolean {
    const prefix = `${taskId}:`;
    for (const key of this.#actionInFlight) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function timeAgo(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";

  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type FocusSnapshot = {
  id: string;
  start: number | null;
  end: number | null;
};

function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) return null;

  const id = active.getAttribute("data-focus-id");
  if (!id) return null;

  const start = "selectionStart" in active
    ? (active as HTMLInputElement | HTMLTextAreaElement).selectionStart
    : null;
  const end = "selectionEnd" in active
    ? (active as HTMLInputElement | HTMLTextAreaElement).selectionEnd
    : null;

  return { id, start, end };
}

function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;

  const escapedId = cssEscapeAttr(snapshot.id);
  const next = root.querySelector<HTMLElement>(`[data-focus-id="${escapedId}"]`);
  if (!next) return;

  if (document.activeElement !== next) {
    next.focus({ preventScroll: true });
  }

  if (
    snapshot.start !== null
    && typeof (next as HTMLInputElement | HTMLTextAreaElement).setSelectionRange === "function"
  ) {
    const start = snapshot.start;
    const end = snapshot.end ?? snapshot.start;
    (next as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(start, end);
  }
}

function cssEscapeAttr(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function hasText(value: string | null | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function formatRunningAction(action: TaskAction): string {
  if (action === "improve") return "Improving task in background...";
  if (action === "plan") return "Planning task in background...";
  return "Executing task...";
}
