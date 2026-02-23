import { h, clearChildren } from "../lib/dom.ts";
import type { BranchCommit, BranchRef } from "../../shared/types.ts";

export class BranchPanel {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #countEl: HTMLElement;
  #commits: BranchCommit[] = [];

  constructor(container: HTMLElement) {
    this.#countEl = h("span", { class: "bp-count" }, ["0"]);

    const header = h("div", { class: "bp-header" }, [
      h("div", { class: "bp-header-left" }, [
        h("span", { class: "bp-title" }, ["Branch"]),
        this.#countEl,
      ]),
    ]);

    this.#listEl = h("div", { class: "bp-list" });

    this.#el = h("div", { class: "branch-panel" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  render(commits: BranchCommit[]): void {
    this.#commits = commits;
    this.#countEl.textContent = String(commits.length);
    clearChildren(this.#listEl);

    if (commits.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "bp-empty" }, ["No git history"])
      );
      return;
    }

    for (let i = 0; i < commits.length; i++) {
      this.#listEl.appendChild(this.#renderCommit(commits[i], i, commits.length));
    }
  }

  clear(): void {
    this.#commits = [];
    this.#countEl.textContent = "0";
    clearChildren(this.#listEl);
    this.#listEl.appendChild(h("div", { class: "bp-empty" }, ["No git history"]));
  }

  #renderCommit(commit: BranchCommit, index: number, total: number): HTMLElement {
    const refs = commit.refs.slice(0, 4);
    const hiddenRefs = Math.max(0, commit.refs.length - refs.length);
    const refRowItems = [
      ...refs.map((ref) => this.#renderRef(ref)),
      hiddenRefs > 0 ? h("span", { class: "bp-ref bp-ref-more" }, [`+${hiddenRefs}`]) : null as any,
    ].filter(Boolean) as HTMLElement[];

    return h("div", { class: "bp-item" }, [
      h("div", { class: "bp-graph" }, [
        h("span", {
          class: `bp-node${commit.isPushed ? " is-pushed" : " is-local"}${commit.isHead ? " is-head" : ""}`,
        }),
        index < total - 1 ? h("span", { class: "bp-tail" }) : h("span", { class: "bp-tail bp-tail-end" }),
      ]),
      h("div", { class: "bp-main" }, [
        refRowItems.length > 0
          ? h("div", { class: "bp-ref-row" }, refRowItems)
          : null as any,
        h("div", { class: "bp-title-row" }, [
          h("span", { class: "bp-subject", title: commit.subject }, [commit.subject]),
        ].filter(Boolean)),
        h("div", { class: "bp-meta" }, [
          h("span", { class: "bp-author" }, [commit.author]),
          h("span", { class: "bp-dot" }, ["•"]),
          h("span", { class: "bp-time" }, [commit.relativeTime]),
          h("code", { class: "bp-hash" }, [commit.shortHash]),
        ]),
      ]),
    ]);
  }

  #renderRef(ref: BranchRef): HTMLElement {
    return h("span", {
      class: `bp-ref bp-ref-${ref.kind}`,
      title: ref.label,
    }, [ref.label]);
  }

  get element(): HTMLElement {
    return this.#el;
  }
}
