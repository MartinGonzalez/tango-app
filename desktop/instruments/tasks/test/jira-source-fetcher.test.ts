import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchJiraSourceFromUrl,
  parseJiraIssueKeyFromUrl,
} from "../src/backend/jira-source-fetcher.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("jira-source-fetcher", () => {
  test("parses Jira issue keys from URLs", () => {
    expect(parseJiraIssueKeyFromUrl("https://acme.atlassian.net/browse/abc-123")).toBe("ABC-123");
    expect(parseJiraIssueKeyFromUrl("https://acme.atlassian.net/jira/software/projects/ABC/issues/ABC-456")).toBe("ABC-456");
    expect(parseJiraIssueKeyFromUrl("https://acme.atlassian.net/projects/ABC")).toBeNull();
  });

  test("fetches Jira issue and comments with connector auth", async () => {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("/issue/ABC-123?") && !url.includes("/comment?")) {
        return Response.json({
          key: "ABC-123",
          fields: {
            summary: "Fix login flow",
            description: {
              type: "doc",
              content: [{
                type: "paragraph",
                content: [{ type: "text", text: "The login endpoint is flaky." }],
              }],
            },
            project: { name: "Acme" },
            status: { name: "In Progress" },
            issuetype: { name: "Bug" },
            assignee: { displayName: "Martin" },
            reporter: { displayName: "QA" },
          },
        });
      }

      if (url.includes("/issue/ABC-123/comment?")) {
        return Response.json({
          comments: [{
            author: { displayName: "Alice" },
            created: "2026-02-24T12:00:00.000Z",
            body: {
              type: "doc",
              content: [{
                type: "paragraph",
                content: [{ type: "text", text: "Needs tests before merge." }],
              }],
            },
          }],
        });
      }

      return Response.json({ errorMessages: ["unexpected request"] }, { status: 400 });
    };

    const result = await fetchJiraSourceFromUrl(
      "https://acme.atlassian.net/browse/ABC-123",
      {
        accessToken: "jira-access",
        cloudId: "cloud-1",
      }
    );

    expect(result.fetchStatus).toBe("success");
    expect(result.kind).toBe("jira");
    expect(result.title).toBe("ABC-123: Fix login flow");
    expect(result.content).toContain("Jira issue ABC-123");
    expect(result.content).toContain("Needs tests before merge");
  });

  test("returns actionable error for unsupported Jira URLs", async () => {
    const result = await fetchJiraSourceFromUrl(
      "https://acme.atlassian.net/projects/ABC",
      {
        accessToken: "jira-access",
        cloudId: "cloud-1",
      }
    );

    expect(result.fetchStatus).toBe("network_error");
    expect(result.error).toContain("Unsupported Jira URL");
  });
});
