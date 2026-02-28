import { describe, expect, test } from "bun:test";
import {
  fetchSlackSourceFromPermalink,
  parseSlackPermalink,
} from "../src/backend/slack-source-fetcher.ts";

describe("slack-source-fetcher", () => {
  test("parses Slack permalinks", () => {
    const parsed = parseSlackPermalink("https://acme.slack.com/archives/C12345678/p1735689600123456");
    expect(parsed).not.toBeNull();
    expect(parsed?.channelId).toBe("C12345678");
    expect(parsed?.messageTs).toBe("1735689600.123456");
  });

  test("fetches Slack thread content", async () => {
    const result = await fetchSlackSourceFromPermalink(
      "https://acme.slack.com/archives/C12345678/p1735689600123456",
      "xoxp-token",
      {
        fetchImpl: async () => Response.json({
          ok: true,
          messages: [
            {
              ts: "1735689600.123456",
              user: "U123",
              text: "Root message",
            },
            {
              ts: "1735689601.123456",
              user: "U234",
              text: "Reply message",
            },
          ],
        }),
      }
    );

    expect(result.fetchStatus).toBe("success");
    expect(result.kind).toBe("slack");
    expect(result.title).toContain("Root message");
    expect(result.content).toContain("Reply message");
  });

  test("returns actionable error for missing permissions", async () => {
    const result = await fetchSlackSourceFromPermalink(
      "https://acme.slack.com/archives/C12345678/p1735689600123456",
      "xoxp-token",
      {
        fetchImpl: async () => Response.json({
          ok: false,
          error: "missing_scope",
        }),
      }
    );

    expect(result.fetchStatus).toBe("http_error");
    expect(result.error).toContain("Connect Slack in Connectors");
    expect(result.error).toContain("missing_scope");
  });
});
