import { describe, expect, test } from "bun:test";
import {
  GhCommandError,
  PullRequestProvider,
  classifyGhFailure,
} from "../src/bun/pr-provider.ts";

type RunnerResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

describe("pr-provider", () => {
  test("classifies gh stderr correctly", () => {
    expect(classifyGhFailure("please run gh auth login first")).toBe("auth_failed");
    expect(classifyGhFailure("command not found: gh")).toBe("gh_missing");
    expect(classifyGhFailure("something else")).toBe("api_error");
  });

  test("loads assigned pull requests", async () => {
    const provider = new PullRequestProvider(async (args) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("search prs --assignee @me")) {
        return okJson([
          {
            number: 8,
            title: "Fix bug",
            repository: { nameWithOwner: "acme/repo" },
            author: { login: "martin", is_bot: false },
            isDraft: false,
            updatedAt: "2026-02-24T10:00:00Z",
            url: "https://github.com/acme/repo/pull/8",
          },
        ]);
      }
      return fail("unexpected");
    });

    const pullRequests = await provider.getAssignedPullRequests(10);
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0].repo).toBe("acme/repo");
    expect(pullRequests[0].number).toBe(8);
  });

  test("loads pull requests opened by me", async () => {
    const provider = new PullRequestProvider(async (args) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("search prs --author @me")) {
        return okJson([
          {
            number: 12,
            title: "Feature",
            repository: { nameWithOwner: "acme/repo" },
            author: { login: "martin", is_bot: false },
            isDraft: false,
            updatedAt: "2026-02-24T11:00:00Z",
            url: "https://github.com/acme/repo/pull/12",
          },
        ]);
      }
      return fail("unexpected");
    });

    const pullRequests = await provider.getOpenedPullRequests(25);
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0].number).toBe(12);
    expect(pullRequests[0].repo).toBe("acme/repo");
  });

  test("loads pull requests where review was requested from me", async () => {
    const provider = new PullRequestProvider(async (args) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("search prs --review-requested @me")) {
        return okJson([
          {
            number: 34,
            title: "Review me",
            repository: { nameWithOwner: "acme/repo" },
            author: { login: "alice", is_bot: false },
            isDraft: false,
            updatedAt: "2026-02-24T12:00:00Z",
            url: "https://github.com/acme/repo/pull/34",
          },
        ]);
      }
      return fail("unexpected");
    });

    const pullRequests = await provider.getReviewRequestedPullRequests(15);
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0].number).toBe(34);
    expect(pullRequests[0].repo).toBe("acme/repo");
  });

  test("loads pull request detail with conversation timeline", async () => {
    const provider = new PullRequestProvider(async (args) => {
      const cmd = args.join(" ");

      if (cmd.startsWith("pr view 21 -R acme/repo")) {
        return okJson({
          number: 21,
          title: "Add feature",
          body: "PR body",
          url: "https://github.com/acme/repo/pull/21",
          state: "OPEN",
          isDraft: false,
          author: { login: "martin", name: "Martin", is_bot: false },
          baseRefName: "main",
          headRefName: "feature",
          headRefOid: "head-sha-1",
          reviewDecision: "REVIEW_REQUIRED",
          mergeStateStatus: "BLOCKED",
          createdAt: "2026-02-24T09:00:00Z",
          updatedAt: "2026-02-24T10:10:00Z",
          commits: [
            {
              oid: "abcdef0123456789",
              messageHeadline: "feat: add feature",
              messageBody: "details",
              authoredDate: "2026-02-24T09:10:00Z",
              committedDate: "2026-02-24T09:11:00Z",
              authors: [{ login: "martin", name: "Martin" }],
            },
          ],
          statusCheckRollup: [
            {
              __typename: "CheckRun",
              name: "build",
              workflowName: "CI",
              status: "COMPLETED",
              conclusion: "SUCCESS",
              detailsUrl: "https://ci.example/build",
              startedAt: "2026-02-24T09:15:00Z",
              completedAt: "2026-02-24T09:18:00Z",
            },
            {
              __typename: "StatusContext",
              context: "lint",
              state: "PENDING",
              targetUrl: "https://ci.example/lint",
            },
          ],
        });
      }

      if (cmd === "api repos/acme/repo/pulls/21/files --paginate --slurp") {
        return okJson([[
          {
            filename: "src/app.ts",
            previous_filename: null,
            status: "modified",
            additions: 4,
            deletions: 2,
            sha: "file-sha-1",
          },
        ]]);
      }

      if (cmd === "api repos/acme/repo/issues/21/comments --paginate --slurp") {
        return okJson([[{
          id: 101,
          body: "Issue comment",
          created_at: "2026-02-24T09:30:00Z",
          updated_at: "2026-02-24T09:31:00Z",
          user: { login: "alice" },
          author_association: "MEMBER",
        }]]);
      }

      if (cmd === "api repos/acme/repo/pulls/21/reviews --paginate --slurp") {
        return okJson([[{
          id: 202,
          body: "Looks good",
          state: "COMMENTED",
          submitted_at: "2026-02-24T09:20:00Z",
          commit_id: "abcdef0123456789",
          user: { login: "bob" },
          author_association: "CONTRIBUTOR",
        }]]);
      }

      if (cmd === "api repos/acme/repo/pulls/21/comments --paginate --slurp") {
        return okJson([[
          {
            id: 303,
            body: "Please update this",
            path: "src/app.ts",
            line: 10,
            original_line: 10,
            side: "RIGHT",
            commit_id: "abcdef0123456789",
            created_at: "2026-02-24T09:40:00Z",
            updated_at: "2026-02-24T09:40:00Z",
            in_reply_to_id: null,
            user: { login: "reviewer" },
            author_association: "MEMBER",
          },
          {
            id: 304,
            body: "Done",
            path: "src/app.ts",
            line: 10,
            original_line: 10,
            side: "RIGHT",
            commit_id: "abcdef0123456789",
            created_at: "2026-02-24T09:45:00Z",
            updated_at: "2026-02-24T09:45:00Z",
            in_reply_to_id: 303,
            user: { login: "martin" },
            author_association: "OWNER",
          },
        ]]);
      }

      return fail(`unexpected command: ${cmd}`);
    });

    const detail = await provider.getPullRequestDetail("acme/repo", 21);

    expect(detail.files).toHaveLength(1);
    expect(detail.checks).toHaveLength(2);
    expect(detail.conversation.map((item) => item.kind)).toEqual([
      "review",
      "issue_comment",
      "review_thread",
    ]);

    const thread = detail.conversation.find((item) => item.kind === "review_thread");
    expect(thread && thread.kind === "review_thread" ? thread.comments.length : 0).toBe(2);
    expect(detail.warnings).toEqual([]);
  });

  test("includes warnings for partial endpoint failures", async () => {
    const provider = new PullRequestProvider(async (args) => {
      const cmd = args.join(" ");

      if (cmd.startsWith("pr view 7 -R acme/repo")) {
        return okJson({
          number: 7,
          title: "Test",
          body: "",
          url: "https://github.com/acme/repo/pull/7",
          state: "OPEN",
          isDraft: false,
          author: { login: "martin", name: "Martin", is_bot: false },
          baseRefName: "main",
          headRefName: "feature",
          headRefOid: "head-sha",
          reviewDecision: null,
          mergeStateStatus: null,
          createdAt: "2026-02-24T09:00:00Z",
          updatedAt: "2026-02-24T09:10:00Z",
          commits: [],
          statusCheckRollup: [],
        });
      }

      if (cmd === "api repos/acme/repo/pulls/7/files --paginate --slurp") {
        return fail("api down", 1);
      }

      if (cmd.endsWith("issues/7/comments --paginate --slurp")) return okJson([[]]);
      if (cmd.endsWith("pulls/7/reviews --paginate --slurp")) return okJson([[]]);
      if (cmd.endsWith("pulls/7/comments --paginate --slurp")) return okJson([[]]);

      return fail("unexpected");
    });

    const detail = await provider.getPullRequestDetail("acme/repo", 7);
    expect(detail.warnings.length).toBe(1);
    expect(detail.warnings[0]).toContain("PR files");
  });

  test("throws auth_failed when gh auth is missing", async () => {
    const provider = new PullRequestProvider(async () => {
      return {
        stdout: "",
        stderr: "please run gh auth login",
        exitCode: 1,
      };
    });

    await expect(provider.getAssignedPullRequests()).rejects.toBeInstanceOf(
      GhCommandError
    );

    try {
      await provider.getAssignedPullRequests();
    } catch (error) {
      expect(error).toBeInstanceOf(GhCommandError);
      expect((error as GhCommandError).code).toBe("auth_failed");
    }
  });

  test("replies to an inline review comment", async () => {
    let command = "";
    const provider = new PullRequestProvider(async (args) => {
      command = args.join(" ");
      return okJson({ id: 999, body: "Thanks" });
    });

    await provider.replyPullRequestReviewComment(
      "acme/repo",
      21,
      "303",
      "Thanks for the review"
    );

    expect(command).toBe(
      "api repos/acme/repo/pulls/21/comments/303/replies -X POST -f body=Thanks for the review"
    );
  });

  test("validates review reply payload before running gh", async () => {
    const provider = new PullRequestProvider(async () => okJson({}));

    await expect(
      provider.replyPullRequestReviewComment("acme/repo", 21, "0", "ok")
    ).rejects.toBeInstanceOf(GhCommandError);

    await expect(
      provider.replyPullRequestReviewComment("acme/repo", 21, "303", "   ")
    ).rejects.toBeInstanceOf(GhCommandError);
  });

  test("creates a new inline review comment", async () => {
    let command = "";
    const provider = new PullRequestProvider(async (args) => {
      command = args.join(" ");
      return okJson({ id: 111, body: "comment" });
    });

    await provider.createPullRequestReviewComment("acme/repo", 21, {
      commitSha: "abcdef0123456789",
      path: "src/app.ts",
      line: 10,
      side: "RIGHT",
      body: "Please rename this variable",
    });

    expect(command).toBe(
      "api repos/acme/repo/pulls/21/comments -X POST -f body=Please rename this variable -f commit_id=abcdef0123456789 -f path=src/app.ts -f side=RIGHT -F line=10"
    );
  });

  test("validates inline review comment payload before running gh", async () => {
    const provider = new PullRequestProvider(async () => okJson({}));

    await expect(
      provider.createPullRequestReviewComment("acme/repo", 21, {
        commitSha: "",
        path: "src/app.ts",
        line: 10,
        side: "RIGHT",
        body: "ok",
      })
    ).rejects.toBeInstanceOf(GhCommandError);

    await expect(
      provider.createPullRequestReviewComment("acme/repo", 21, {
        commitSha: "abcdef",
        path: "",
        line: 10,
        side: "RIGHT",
        body: "ok",
      })
    ).rejects.toBeInstanceOf(GhCommandError);

    await expect(
      provider.createPullRequestReviewComment("acme/repo", 21, {
        commitSha: "abcdef",
        path: "src/app.ts",
        line: 0,
        side: "RIGHT",
        body: "ok",
      })
    ).rejects.toBeInstanceOf(GhCommandError);

    await expect(
      provider.createPullRequestReviewComment("acme/repo", 21, {
        commitSha: "abcdef",
        path: "src/app.ts",
        line: 10,
        side: "RIGHT",
        body: "  ",
      })
    ).rejects.toBeInstanceOf(GhCommandError);
  });
});

function okJson(value: unknown): RunnerResult {
  return {
    stdout: JSON.stringify(value),
    stderr: "",
    exitCode: 0,
  };
}

function fail(stderr: string, exitCode = 1): RunnerResult {
  return {
    stdout: "",
    stderr,
    exitCode,
  };
}
