import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  fetchTaskSourceFromUrl,
  inferSourceKindFromUrl,
} from "../src/bun/task-source-fetcher.ts";

let server: Bun.Server;
let baseUrl = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/ok") {
        return new Response(
          "<html><head><title>Ticket ABC-123</title></head><body><h1>Hello</h1><p>Body</p></body></html>",
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          }
        );
      }

      if (path === "/private") {
        return new Response("forbidden", {
          status: 401,
          headers: {
            "content-type": "text/plain",
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("task source fetcher", () => {
  test("fetches a successful source and extracts text", async () => {
    const result = await fetchTaskSourceFromUrl(`${baseUrl}/ok`);
    expect(result.fetchStatus).toBe("success");
    expect(result.httpStatus).toBe(200);
    expect(result.title).toBe("Ticket ABC-123");
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("Body");
  });

  test("returns http_error for private content", async () => {
    const result = await fetchTaskSourceFromUrl(`${baseUrl}/private`);
    expect(result.fetchStatus).toBe("http_error");
    expect(result.httpStatus).toBe(401);
    expect(result.error).toContain("HTTP 401");
  });

  test("returns network_error when endpoint is unreachable", async () => {
    const result = await fetchTaskSourceFromUrl("http://127.0.0.1:1/unreachable", {
      timeoutMs: 1000,
    });
    expect(result.fetchStatus).toBe("network_error");
    expect(result.httpStatus).toBeNull();
  });

  test("infers source kind from host", () => {
    expect(inferSourceKindFromUrl("https://team.slack.com/archives/C1/p123")).toBe("slack");
    expect(inferSourceKindFromUrl("https://acme.atlassian.net/browse/PROJ-1")).toBe("jira");
    expect(inferSourceKindFromUrl("https://example.com/docs/1")).toBe("url");
  });
});
