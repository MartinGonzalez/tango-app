import { describe, expect, test } from "bun:test";
import { PRView } from "../src/mainview/components/pr-view.ts";
import type {
  PullRequestAgentReviewData,
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
      selectedAgentReviewDocument: createDocument(runningRun),
    });

    const tabLabels = Array.from(container.querySelectorAll(".pr-view-activity-tab"))
      .map((node) => node.textContent || "");
    expect(tabLabels.some((label) => label.includes("Agent reviews"))).toBe(true);

    const button = container.querySelector(".pr-view-agent-review-btn") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
  });

  test("selects agent review version and renders structured content", () => {
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
    const documentV2: PullRequestAgentReviewDocument = createDocument(run2, {
      pr_description: "- Changed X\n- Changed Y",
      pr_summary: "Agent Review v2 summary",
    });

    view.render(createDetail(), {
      agentReviews: [run1, run2],
      selectedAgentReviewVersion: 2,
      selectedAgentReviewDocument: documentV2,
    });

    const agentTab = Array.from(container.querySelectorAll(".pr-view-activity-tab"))
      .find((node) => (node.textContent || "").includes("Agent reviews")) as HTMLButtonElement | undefined;
    expect(agentTab).toBeDefined();
    agentTab?.click();

    expect(container.textContent || "").toContain("PR Description");
    expect(container.textContent || "").toContain("Summary");
    expect(container.textContent || "").toContain("Agent Review v2 summary");

    const run1Button = Array.from(container.querySelectorAll(".pr-agent-review-run"))
      .find((node) => (node.textContent || "").includes("v1")) as HTMLButtonElement | undefined;
    expect(run1Button).toBeDefined();
    run1Button?.click();

    expect(selectedVersions).toEqual([1]);
  });

  test("renders apply button per suggestion and invokes callback with suggestionIndex", async () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const applied: number[] = [];
    const view = new PRView(container, {
      onSelectCommit: () => {},
      onOpenPullRequest: () => {},
      onSelectFile: () => {},
      onApplyAgentReviewIssue: async ({ suggestionIndex }) => {
        applied.push(suggestionIndex);
      },
    });

    const run = createRun({ version: 1, status: "completed" });
    view.render(createDetail(), {
      agentReviews: [run],
      selectedAgentReviewVersion: 1,
      selectedAgentReviewDocument: createDocument(run, {
        suggestions: [
          {
            level: "Important",
            title: "Suggestion A",
            reason: "Because this should change",
            solutions: "Do the change",
            benefit: "Safer behavior",
            applied: false,
          },
          {
            level: "Low",
            title: "Suggestion B",
            reason: "Reason B",
            solutions: "Solution B",
            benefit: "Benefit B",
            applied: true,
          },
        ],
      }),
    });

    const agentTab = Array.from(container.querySelectorAll(".pr-view-activity-tab"))
      .find((node) => (node.textContent || "").includes("Agent reviews")) as HTMLButtonElement | undefined;
    agentTab?.click();

    const actionButtons = container.querySelectorAll(".pr-agent-review-action-btn");
    expect(actionButtons.length).toBe(2);
    expect((actionButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((actionButtons[1] as HTMLButtonElement).disabled).toBe(true);
    expect((actionButtons[1] as HTMLButtonElement).textContent).toContain("Applied");
    expect(container.textContent || "").toContain("Why");
    expect(container.textContent || "").toContain("Solution/Solutions");
    expect(container.textContent || "").toContain("Benefit");

    (actionButtons[0] as HTMLButtonElement).click();
    await Promise.resolve();
    expect(applied).toEqual([0]);
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
    fileName: `acme-repo-pr44-agent-review${overrides.version === 1 ? "" : `-${overrides.version}`}.json`,
    filePath: `/tmp/acme-repo-pr44-agent-review-${overrides.version}.json`,
    headSha: "head-sha",
    status: overrides.status,
    sessionId: overrides.status === "running" ? "session-1" : null,
    startedAt: "2026-02-24T10:00:00.000Z",
    updatedAt: "2026-02-24T10:05:00.000Z",
    completedAt: overrides.completedAt ?? "2026-02-24T10:05:00.000Z",
    error: null,
  };
}

function createDocument(
  run: PullRequestAgentReviewRun,
  patch?: Partial<PullRequestAgentReviewData>
): PullRequestAgentReviewDocument {
  const review: PullRequestAgentReviewData = {
    metadata: {
      repository: "acme/repo",
      pr_number: "44",
    },
    pr_description: "- Description",
    pr_summary: "Summary",
    strengths: "Strengths",
    improvements: "Improvements",
    suggestions: [
      {
        level: "Important",
        title: "Suggestion",
        reason: "Reason",
        solutions: "Solutions",
        benefit: "Benefit",
        applied: false,
      },
    ],
    final_veredic: "Final",
    ...patch,
  };
  return {
    run,
    rawJson: JSON.stringify(review),
    review,
    renderedMarkdown: "# Agent Review",
    parseError: null,
  };
}
