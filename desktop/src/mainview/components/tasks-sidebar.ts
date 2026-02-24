import { clearChildren, h } from "../lib/dom.ts";
import type { TaskCardSummary } from "../../shared/types.ts";

export type TaskWorkspaceGroup = {
  workspacePath: string;
  workspaceName: string;
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
  }

  #renderGroup(group: TaskWorkspaceGroup): HTMLElement {
    const wrapper = h("div", { class: "task-group" }, [
      h("div", { class: "task-group-header" }, [
        h("span", { class: "task-group-title", title: group.workspacePath }, [group.workspaceName]),
        h("button", {
          class: "task-group-new-btn",
          title: "New task",
          onclick: () => this.#callbacks.onCreateTask(group.workspacePath),
        }, ["+"]),
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

    wrapper.appendChild(list);
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
        h("span", { class: `task-row-status task-status-${task.status}` }, [task.status]),
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
