import { describe, expect, test } from "bun:test";
import { DiffView } from "../src/mainview/components/diff-view.ts";

describe("diff-view toolbar dogfooding", () => {
  test("uses shared Tango UI buttons for commit and icon actions", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let commits = 0;
    const container = document.createElement("div");
    const view = new DiffView(container, {
      onCommitClick: () => {
        commits += 1;
      },
    });

    const toolbar = view.toolbarElement;
    const commitBtn = toolbar.querySelector('button[title="Commit changes"]') as HTMLButtonElement | null;
    const filesBtn = toolbar.querySelector('button[title="Toggle files changed"]') as HTMLButtonElement | null;
    const branchBtn = toolbar.querySelector('button[title="Toggle branch history"]') as HTMLButtonElement | null;

    expect(commitBtn).toBeTruthy();
    expect(commitBtn?.className).toContain("tui-btn");
    expect(commitBtn?.className).toContain("tui-btn-primary");
    expect(commitBtn?.className).toContain("dv-commit-btn");

    expect(filesBtn).toBeTruthy();
    expect(filesBtn?.className).toContain("tui-icon-btn");
    expect(filesBtn?.className).toContain("dv-icon-btn");

    expect(branchBtn).toBeTruthy();
    expect(branchBtn?.className).toContain("tui-icon-btn");
    expect(branchBtn?.className).toContain("dv-icon-btn");

    view.setCommitButtonVisible(true);
    commitBtn?.click();
    expect(commits).toBe(1);
  });

  test("toggles icon button active state with is-active class", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const view = new DiffView(container);
    const toolbar = view.toolbarElement;
    const filesBtn = toolbar.querySelector('button[title="Toggle files changed"]') as HTMLButtonElement | null;
    const branchBtn = toolbar.querySelector('button[title="Toggle branch history"]') as HTMLButtonElement | null;

    expect(filesBtn?.classList.contains("is-active")).toBe(false);
    view.setFilesPanelVisible(true);
    expect(filesBtn?.classList.contains("is-active")).toBe(true);

    expect(branchBtn?.classList.contains("is-active")).toBe(false);
    view.setBranchPanelVisible(true, false);
    expect(branchBtn?.classList.contains("is-active")).toBe(true);
  });
});
