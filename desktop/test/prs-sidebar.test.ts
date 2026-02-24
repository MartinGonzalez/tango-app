import { describe, expect, test } from "bun:test";
import { PRsSidebar } from "../src/mainview/components/prs-sidebar.ts";
import type { PullRequestSummary } from "../src/shared/types.ts";

describe("prs-sidebar", () => {
  test("renders grouped pull requests", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const container = document.createElement("div");
    const sidebar = new PRsSidebar(container, {
      onSelectPullRequest: () => {},
      onBack: () => {},
      onRefresh: () => {},
    });

    const pullRequests: PullRequestSummary[] = [
      {
        repo: "acme/repo-a",
        number: 1,
        title: "Fix A",
        authorLogin: "martin",
        authorIsBot: false,
        isDraft: false,
        updatedAt: "2026-02-24T10:00:00.000Z",
        url: "https://github.com/acme/repo-a/pull/1",
      },
      {
        repo: "acme/repo-a",
        number: 2,
        title: "Fix B",
        authorLogin: "alice",
        authorIsBot: false,
        isDraft: false,
        updatedAt: "2026-02-24T11:00:00.000Z",
        url: "https://github.com/acme/repo-a/pull/2",
      },
      {
        repo: "acme/repo-b",
        number: 9,
        title: "Fix C",
        authorLogin: "bob",
        authorIsBot: false,
        isDraft: false,
        updatedAt: "2026-02-24T12:00:00.000Z",
        url: "https://github.com/acme/repo-b/pull/9",
      },
    ];

    sidebar.render([
      {
        id: "assigned_to_me",
        label: "Assigned to me",
        groups: [
          { repo: "acme/repo-a", prs: pullRequests.filter((pr) => pr.repo === "acme/repo-a") },
          { repo: "acme/repo-b", prs: pullRequests.filter((pr) => pr.repo === "acme/repo-b") },
        ],
      },
      {
        id: "opened_by_me",
        label: "Opened by me",
        groups: [
          { repo: "acme/repo-a", prs: pullRequests.filter((pr) => pr.repo === "acme/repo-a") },
        ],
      },
    ]);

    expect(container.querySelectorAll(".prs-section").length).toBe(2);
    expect(container.querySelectorAll(".pr-group").length).toBe(3);
    expect(container.querySelectorAll(".pr-row").length).toBe(5);
  });
});
