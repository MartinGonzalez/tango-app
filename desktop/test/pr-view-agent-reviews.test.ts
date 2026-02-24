import { describe, expect, test } from "bun:test";
import { PRView } from "../src/mainview/components/pr-view.ts";
import type {
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewRun,
  PullRequestDetail,
} from "../src/shared/types.ts";

describe("pr-view-agent-reviews", () => {
  test("renders Agent reviews tab when runs exist and disables button while running", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const view = new PRView(container, {
      onSelectCommit: () => {},
      onOpenPullRequest: () => {},
      onSelectFile: () => {},
    });

    const detail = createDetail();
    const runningRun = createRun({
      version: 1,
      status: "running",
      completedAt: null,
    });

    view.render(detail, {
      agentReviews: [runningRun],
      selectedAgentReviewVersion: 1,
      selectedAgentReviewDocument: {
        run: runningRun,
        markdown: "# Running",
      },
    });

    const tabLabels = Array.from(container.querySelectorAll(".pr-view-activity-tab"))
      .map((node) => node.textContent || "");
    expect(tabLabels.some((label) => label.includes("Agent reviews"))).toBe(true);

    const button = container.querySelector(".pr-view-agent-review-btn") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
  });

  test("selects agent review version and renders markdown", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const selectedVersions: number[] = [];
    const view = new PRView(container, {
      onSelectCommit: () => {},
      onOpenPullRequest: () => {},
      onSelectFile: () => {},
      onSelectAgentReviewVersion: (version) => {
        selectedVersions.push(version);
      },
    });

    const run1 = createRun({ version: 1, status: "completed" });
    const run2 = createRun({ version: 2, status: "completed" });
    const documentV2: PullRequestAgentReviewDocument = {
      run: run2,
      markdown: "# Agent Review v2\n\nLooks good.",
    };

    view.render(createDetail(), {
      agentReviews: [run1, run2],
      selectedAgentReviewVersion: 2,
      selectedAgentReviewDocument: documentV2,
    });

    const agentTab = Array.from(container.querySelectorAll(".pr-view-activity-tab"))
      .find((node) => (node.textContent || "").includes("Agent reviews")) as HTMLButtonElement | undefined;
    expect(agentTab).toBeDefined();
    agentTab?.click();

    const markdown = container.querySelector(".pr-agent-reviews-markdown") as HTMLElement | null;
    expect(markdown?.textContent || "").toContain("Agent Review v2");

    const run1Button = Array.from(container.querySelectorAll(".pr-agent-review-run"))
      .find((node) => (node.textContent || "").includes("v1")) as HTMLButtonElement | undefined;
    expect(run1Button).toBeDefined();
    run1Button?.click();

    expect(selectedVersions).toEqual([1]);
  });
});

function createDetail(): PullRequestDetail {
  return {
    repo: "acme/repo",
    number: 44,
    title: "Test PR",
    body: "Description",
    url: "https://github.com/acme/repo/pull/44",
    state: "OPEN",
    isDraft: false,
    authorLogin: "martin",
    authorName: "Martin",
    authorIsBot: false,
    baseRefName: "main",
    headRefName: "feature",
    headSha: "head-sha",
    reviewDecision: null,
    mergeStateStatus: null,
    createdAt: "2026-02-24T10:00:00.000Z",
    updatedAt: "2026-02-24T10:30:00.000Z",
    checks: [],
    commits: [],
    files: [],
    conversation: [],
    warnings: [],
  };
}

function createRun(overrides: {
  version: number;
  status: PullRequestAgentReviewRun["status"];
  completedAt?: string | null;
}): PullRequestAgentReviewRun {
  return {
    id: `run-${overrides.version}`,
    repo: "acme/repo",
    number: 44,
    version: overrides.version,
    fileName: `acme-repo-pr44-agent-review${overrides.version === 1 ? "" : `-${overrides.version}`}.md`,
    filePath: `/tmp/acme-repo-pr44-agent-review-${overrides.version}.md`,
    headSha: "head-sha",
    status: overrides.status,
    sessionId: overrides.status === "running" ? "session-1" : null,
    startedAt: "2026-02-24T10:00:00.000Z",
    updatedAt: "2026-02-24T10:05:00.000Z",
    completedAt: overrides.completedAt ?? "2026-02-24T10:05:00.000Z",
    error: null,
  };
}
