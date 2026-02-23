import { afterEach, describe, expect, test } from "bun:test";
import { WatcherClient } from "../src/bun/watcher-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("WatcherClient", () => {
  test("falls back to localhost when 127.0.0.1 is unreachable", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const href = String(url);
      calls.push(href);
      if (href.startsWith("http://127.0.0.1:4242")) {
        throw new Error("connect ECONNREFUSED");
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const watcher = new WatcherClient();
    const up = await watcher.isServerUp();

    expect(up).toBe(true);
    expect(calls[0]).toBe("http://127.0.0.1:4242/health");
    expect(calls[1]).toBe("http://localhost:4242/health");
  });

  test("deduplicates identical poll errors until a successful snapshot", async () => {
    let attempt = 0;
    globalThis.fetch = (async () => {
      attempt += 1;
      if (attempt <= 2 || attempt === 4) {
        throw new Error("Unable to connect");
      }
      return new Response(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          processes: [],
          tasks: [],
          subagents: [],
          eventCount: 0,
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const errors: string[] = [];
    const watcher = new WatcherClient({ url: "http://127.0.0.1:4242", pollMs: 5 });
    watcher.onError((error) => errors.push(error.message));

    watcher.start();
    for (let i = 0; i < 40 && attempt < 4; i++) {
      await Bun.sleep(5);
    }
    watcher.stop();

    expect(attempt).toBeGreaterThanOrEqual(4);
    expect(errors).toEqual(["Unable to connect", "Unable to connect"]);
  });
});
