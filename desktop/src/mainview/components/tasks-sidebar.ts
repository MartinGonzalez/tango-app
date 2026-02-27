import { clearChildren, h } from "../lib/dom.ts";
import { vcsBranchLabel } from "../lib/icons.ts";
import type { TaskCardSummary } from "../../shared/types.ts";

function materialIcon(name: string): HTMLElement {
  return h("span", { class: "material-symbols-outlined", "aria-hidden": "true" }, [name]);
}

export type TaskStageGroup = {
  stagePath: string;
  stageName: string;
  branch: string | null;
  tasks: TaskCardSummary[];
};

export type TasksSidebarCallbacks = {
  onSelectTask: (taskId: string, stagePath: string) => void;
  onCreateTask: (stagePath: string) => void;
  onBack: () => void;
};

export class TasksSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: TasksSidebarCallbacks;
  #groups: TaskStageGroup[] = [];
  #selectedTaskId: string | null = null;
  #loading = false;
  #expandedStagePaths = new Set<string>();
  #collapsedStagePaths = new Set<string>();
  #animatingPath: string | null = null;

  constructor(container: HTMLElement, callbacks: TasksSidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "tasks-sidebar-header" }, [
      h("button", {
        class: "tasks-sidebar-back-btn",
        title: "Back to stages",
        onclick: () => this.#callbacks.onBack(),
      }, ["\u2190"]),
      h("span", { class: "tasks-sidebar-title" }, ["Tasks"]),
    ]);

    this.#listEl = h("div", { class: "tasks-sidebar-list" });

    this.#el = h("div", { class: "tasks-sidebar" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(groups: TaskStageGroup[], opts?: { loading?: boolean }): void {
    this.#groups = groups;
    this.#loading = Boolean(opts?.loading);
    this.#renderContent();
  }

  setSelection(taskId: string | null): void {
    this.#selectedTaskId = taskId;
    this.#renderContent();
  }

  #renderContent(): void {
    clearChildren(this.#listEl);

    if (this.#loading) {
      this.#listEl.appendChild(
        h("div", { class: "tasks-sidebar-empty" }, ["Loading tasks..."])
      );
      return;
    }

    if (this.#groups.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "tasks-sidebar-empty" }, ["No stages"])
      );
      return;
    }

    for (const group of this.#groups) {
      this.#listEl.appendChild(this.#renderGroup(group));
    }
    this.#animatingPath = null;
  }

  #renderGroup(group: TaskStageGroup): HTMLElement {
    const groupHasSelection = group.tasks.some((t) => t.id === this.#selectedTaskId);
    const isExpanded = this.#expandedStagePaths.has(group.stagePath)
      || (groupHasSelection && !this.#collapsedStagePaths.has(group.stagePath));
    const isCollapsed = !isExpanded;
    const toggleCollapsed = () => {
      if (isExpanded) {
        this.#expandedStagePaths.delete(group.stagePath);
        this.#collapsedStagePaths.add(group.stagePath);
      } else {
        this.#expandedStagePaths.add(group.stagePath);
        this.#collapsedStagePaths.delete(group.stagePath);
      }
      this.#animatingPath = group.stagePath;
      this.#renderContent();
    };

    const wrapper = h("div", { class: `task-group${!isCollapsed ? " expanded" : ""}${groupHasSelection ? " active" : ""}` }, [
      h("div", {
        class: `task-group-header${isCollapsed ? " is-collapsed" : ""}`,
        role: "button",
        tabindex: "0",
        onclick: toggleCollapsed,
        onkeydown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleCollapsed();
        },
      }, [
        h("div", { class: "task-group-meta" }, [
          h("span", { class: "task-group-title", title: group.stagePath }, [group.stageName]),
          group.branch ? vcsBranchLabel(group.branch) : null,
        ].filter(Boolean) as HTMLElement[]),
        ...(!isCollapsed ? [h("button", {
          class: "task-group-new-btn",
          title: "New task",
          onclick: (event: Event) => {
            event.stopPropagation();
            this.#callbacks.onCreateTask(group.stagePath);
          },
        }, ["+"])] : []),
      ]),
    ]);

    const list = h("div", { class: "task-group-list" });

    if (group.tasks.length === 0) {
      list.appendChild(h("div", { class: "task-group-empty" }, ["No tasks"]));
    } else {
      for (const task of group.tasks) {
        list.appendChild(this.#renderTaskRow(task, group.stagePath));
      }
    }

    const animate = group.stagePath === this.#animatingPath;
    const initialCollapsed = animate ? !isCollapsed : isCollapsed;
    const collapsible = h("div", { class: `collapsible${initialCollapsed ? " is-collapsed" : ""}` }, [
      h("div", { class: "collapsible-inner" }, [list]),
    ]);
    if (animate) {
      requestAnimationFrame(() => {
        collapsible.offsetHeight;
        requestAnimationFrame(() => {
          collapsible.classList.toggle("is-collapsed", isCollapsed);
        });
      });
    }
    wrapper.appendChild(collapsible);
    return wrapper;
  }

  #renderTaskRow(task: TaskCardSummary, stagePath: string): HTMLElement {
    const isActive = task.id === this.#selectedTaskId;

    return h("button", {
      class: `task-row${isActive ? " active" : ""}`,
      onclick: () => this.#callbacks.onSelectTask(task.id, stagePath),
      title: task.title,
    }, [
      h("span", { class: "task-row-title" }, [task.title]),
      h("div", { class: "task-row-meta" }, [
        h("span", { class: `task-row-status task-status-${task.status}` }, [formatTaskStatusLabel(task.status)]),
        h("span", { class: "task-row-time" }, [timeAgo(task.updatedAt)]),
      ]),
    ]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function timeAgo(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";

  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTaskStatusLabel(status: string): string {
  const value = String(status ?? "");
  if (value === "todo") return "Todo";
  if (value === "in_progress") return "In progress";
  if (value === "blocked_by") return "Blocked by";
  if (value === "draft") return "Todo";
  if (value === "planned") return "Todo";
  if (value === "running") return "In progress";
  return value.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}
