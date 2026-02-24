import { clearChildren, h } from "../lib/dom.ts";
import type { PullRequestSummary } from "../../shared/types.ts";

export type PullRequestRepoGroup = {
  repo: string;
  prs: PullRequestSummary[];
};

export type PullRequestSidebarSection = {
  id: string;
  label: string;
  groups: PullRequestRepoGroup[];
  emptyLabel?: string;
};

export type PRsSidebarSelection = {
  repo: string;
  number: number;
} | null;

export type PRsSidebarCallbacks = {
  onSelectPullRequest: (repo: string, number: number) => void;
  onBack: () => void;
  onRefresh: () => void;
};

export class PRsSidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: PRsSidebarCallbacks;
  #sections: PullRequestSidebarSection[] = [];
  #selection: PRsSidebarSelection = null;
  #loading = false;
  #error: string | null = null;
  #collapsedRepos = new Set<string>();

  constructor(container: HTMLElement, callbacks: PRsSidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "prs-sidebar-header" }, [
      h("button", {
        class: "prs-sidebar-back-btn",
        title: "Back to workspaces",
        onclick: () => this.#callbacks.onBack(),
      }, ["\u2190"]),
      h("span", { class: "prs-sidebar-title" }, ["PRs"]),
      h("button", {
        class: "prs-sidebar-refresh-btn",
        title: "Refresh pull requests",
        onclick: () => this.#callbacks.onRefresh(),
      }, ["Refresh"]),
    ]);

    this.#listEl = h("div", { class: "prs-sidebar-list" });

    this.#el = h("div", { class: "prs-sidebar" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(
    sections: PullRequestSidebarSection[],
    opts?: { loading?: boolean; error?: string | null }
  ): void {
    this.#sections = sections;
    this.#loading = Boolean(opts?.loading);
    this.#error = opts?.error ?? null;
    this.#renderContent();
  }

  setSelection(selection: PRsSidebarSelection): void {
    this.#selection = selection;
    this.#renderContent();
  }

  #renderContent(): void {
    clearChildren(this.#listEl);

    if (this.#loading) {
      this.#listEl.appendChild(
        h("div", { class: "prs-sidebar-empty" }, ["Loading pull requests..."])
      );
      return;
    }

    if (this.#error) {
      this.#listEl.appendChild(
        h("div", { class: "prs-sidebar-empty prs-sidebar-error" }, [this.#error])
      );
      return;
    }

    if (this.#sections.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "prs-sidebar-empty" }, ["No pull requests"])
      );
      return;
    }

    for (const section of this.#sections) {
      this.#listEl.appendChild(this.#renderSection(section));
    }
  }

  #renderSection(section: PullRequestSidebarSection): HTMLElement {
    const wrapper = h("section", { class: "prs-section" }, [
      h("div", { class: "prs-section-title" }, [section.label]),
    ]);

    if (section.groups.length === 0) {
      wrapper.appendChild(h("div", { class: "prs-section-empty" }, [section.emptyLabel ?? "No PRs"]));
      return wrapper;
    }

    for (const group of section.groups) {
      wrapper.appendChild(this.#renderGroup(section.id, group));
    }

    return wrapper;
  }

  #renderGroup(sectionId: string, group: PullRequestRepoGroup): HTMLElement {
    const collapsedKey = `${sectionId}:${group.repo}`;
    const isCollapsed = this.#collapsedRepos.has(collapsedKey);
    const toggleCollapsed = () => {
      if (this.#collapsedRepos.has(collapsedKey)) {
        this.#collapsedRepos.delete(collapsedKey);
      } else {
        this.#collapsedRepos.add(collapsedKey);
      }
      this.#renderContent();
    };

    const wrapper = h("div", { class: "pr-group" }, [
      h("div", {
        class: `pr-group-header${isCollapsed ? " is-collapsed" : ""}`,
        role: "button",
        tabindex: "0",
        onclick: toggleCollapsed,
        onkeydown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleCollapsed();
        },
      }, [
        h("span", { class: "pr-group-title", title: group.repo }, [group.repo]),
        h("span", { class: "pr-group-count" }, [String(group.prs.length)]),
      ]),
    ]);

    const list = h("div", { class: "pr-group-list", hidden: isCollapsed });

    if (group.prs.length === 0) {
      list.appendChild(h("div", { class: "pr-group-empty" }, ["No PRs"]));
    } else {
      for (const pr of group.prs) {
        list.appendChild(this.#renderPullRequestRow(pr));
      }
    }

    wrapper.appendChild(list);
    return wrapper;
  }

  #renderPullRequestRow(pr: PullRequestSummary): HTMLElement {
    const isActive = this.#selection?.repo === pr.repo && this.#selection?.number === pr.number;

    return h("button", {
      class: `pr-row${isActive ? " active" : ""}`,
      title: `${pr.repo}#${pr.number}`,
      onclick: () => this.#callbacks.onSelectPullRequest(pr.repo, pr.number),
    }, [
      h("span", { class: "pr-row-title" }, [`#${pr.number} ${pr.title}`]),
      h("div", { class: "pr-row-meta" }, [
        h("span", { class: "pr-row-author" }, [`@${pr.authorLogin}`]),
        h("span", { class: "pr-row-time" }, [timeAgo(pr.updatedAt)]),
      ]),
    ]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

function timeAgo(value: string): string {
  const ts = Date.parse(value);
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
