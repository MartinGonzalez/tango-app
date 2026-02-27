import { clearChildren, h } from "../lib/dom.ts";
import { vcsBranchLabel } from "../lib/icons.ts";
import type { TaskCardSummary } from "../../shared/types.ts";

function materialIcon(name: string): HTMLElement {
  return h("span", { class: "material-symbols-outlined", "aria-hidden": "true" }, [name]);
}

export type TaskWorkspaceGroup = {
  workspacePath: string;
  workspaceName: string;
  branch: string | null;
  tasks: TaskCardSummary[];
};

export type TasksSidebarCallbacks = {
  onSelectTask: (taskId: string, workspacePath: string) => void;
  onCreateTask: (workspacePath: string) => void;
  onBack: () => void;
};

export class TasksSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: TasksSidebarCallbacks;
  #groups: TaskWorkspaceGroup[] = [];
  #selectedTaskId: string | null = null;
  #loading = false;
  #expandedWorkspacePaths = new Set<string>();
  #collapsedWorkspacePaths = new Set<string>();
  #animatingPath: string | null = null;

  constructor(container: HTMLElement, callbacks: TasksSidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "tasks-sidebar-header" }, [
      h("button", {
        class: "tasks-sidebar-back-btn",
        title: "Back to workspaces",
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

  render(groups: TaskWorkspaceGroup[], opts?: { loading?: boolean }): void {
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
        h("div", { class: "tasks-sidebar-empty" }, ["No workspaces"])
      );
      return;
    }

    for (const group of this.#groups) {
      this.#listEl.appendChild(this.#renderGroup(group));
    }
    this.#animatingPath = null;
  }

  #renderGroup(group: TaskWorkspaceGroup): HTMLElement {
    const groupHasSelection = group.tasks.some((t) => t.id === this.#selectedTaskId);
    const isExpanded = this.#expandedWorkspacePaths.has(group.workspacePath)
      || (groupHasSelection && !this.#collapsedWorkspacePaths.has(group.workspacePath));
    const isCollapsed = !isExpanded;
    const toggleCollapsed = () => {
      if (isExpanded) {
        this.#expandedWorkspacePaths.delete(group.workspacePath);
        this.#collapsedWorkspacePaths.add(group.workspacePath);
      } else {
        this.#expandedWorkspacePaths.add(group.workspacePath);
        this.#collapsedWorkspacePaths.delete(group.workspacePath);
      }
      this.#animatingPath = group.workspacePath;
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
          h("span", { class: "task-group-title", title: group.workspacePath }, [group.workspaceName]),
          group.branch ? vcsBranchLabel(group.branch) : null,
        ].filter(Boolean) as HTMLElement[]),
        ...(!isCollapsed ? [h("button", {
          class: "task-group-new-btn",
          title: "New task",
          onclick: (event: Event) => {
            event.stopPropagation();
            this.#callbacks.onCreateTask(group.workspacePath);
          },
        }, ["+"])] : []),
      ]),
    ]);

    const list = h("div", { class: "task-group-list" });

    if (group.tasks.length === 0) {
      list.appendChild(h("div", { class: "task-group-empty" }, ["No tasks"]));
    } else {
      for (const task of group.tasks) {
        list.appendChild(this.#renderTaskRow(task, group.workspacePath));
      }
    }

    const animate = group.workspacePath === this.#animatingPath;
    const initialCollapsed = animate ? !isCollapsed : isCollapsed;
    const collapsible = h("div", { class: `collapsible${initialCollapsed ? " is-collapsed" : ""}` }, [
      h("div", { class: "collapsible-inner" }, [list]),
    ]);
    if (animate) {
      requestAnimationFrame(() => {
        collapsible.classList.toggle("is-collapsed", isCollapsed);
      });
    }
    wrapper.appendChild(collapsible);
    return wrapper;
  }

  #renderTaskRow(task: TaskCardSummary, workspacePath: string): HTMLElement {
    const isActive = task.id === this.#selectedTaskId;

    return h("button", {
      class: `task-row${isActive ? " active" : ""}`,
      onclick: () => this.#callbacks.onSelectTask(task.id, workspacePath),
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
