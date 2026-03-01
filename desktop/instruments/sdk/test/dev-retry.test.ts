import { describe, expect, test } from "bun:test";
import { notifyReloadWithRetry } from "../src/cli/dev.ts";
import type { NotifyResult } from "../src/cli/dev.ts";

describe("notifyReloadWithRetry", () => {
  test("first attempt succeeds — no retry, no launch", async () => {
    let notifyCalls = 0;
    let launchCalled = false;

    const result = await notifyReloadWithRetry({
      instrumentId: "test-instrument",
      installPath: "/path",
      notify: async (): Promise<NotifyResult> => {
        notifyCalls++;
        return "ok";
      },
      launch: async () => {
        launchCalled = true;
      },
      maxRetries: 10,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toBe(true);
    expect(notifyCalls).toBe(1);
    expect(launchCalled).toBe(false);
  });

  test("first unreachable, retry succeeds after launch", async () => {
    let notifyCalls = 0;
    let launchCalled = false;

    const result = await notifyReloadWithRetry({
      instrumentId: "test-instrument",
      installPath: "/path",
      notify: async (): Promise<NotifyResult> => {
        notifyCalls++;
        // Unreachable first 2 calls, succeed on 3rd
        return notifyCalls >= 3 ? "ok" : "unreachable";
      },
      launch: async () => {
        launchCalled = true;
      },
      maxRetries: 10,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toBe(true);
    expect(launchCalled).toBe(true);
    expect(notifyCalls).toBe(3);
  });

  test("all retries exhausted — returns false", async () => {
    let notifyCalls = 0;
    let launchCalled = false;

    const result = await notifyReloadWithRetry({
      instrumentId: "test-instrument",
      installPath: "/path",
      notify: async (): Promise<NotifyResult> => {
        notifyCalls++;
        return "unreachable";
      },
      launch: async () => {
        launchCalled = true;
      },
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toBe(false);
    expect(launchCalled).toBe(true);
    // 1 initial + 3 retries = 4 total
    expect(notifyCalls).toBe(4);
  });

  test("server error on first attempt — stops immediately, no launch", async () => {
    let notifyCalls = 0;
    let launchCalled = false;

    const result = await notifyReloadWithRetry({
      instrumentId: "test-instrument",
      installPath: "/path",
      notify: async (): Promise<NotifyResult> => {
        notifyCalls++;
        return "error";
      },
      launch: async () => {
        launchCalled = true;
      },
      maxRetries: 10,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toBe(false);
    expect(notifyCalls).toBe(1);
    expect(launchCalled).toBe(false);
  });

  test("server comes up but errors — stops retrying", async () => {
    let notifyCalls = 0;
    let launchCalled = false;

    const result = await notifyReloadWithRetry({
      instrumentId: "test-instrument",
      installPath: "/path",
      notify: async (): Promise<NotifyResult> => {
        notifyCalls++;
        // First call unreachable, second call server responds with error
        return notifyCalls === 1 ? "unreachable" : "error";
      },
      launch: async () => {
        launchCalled = true;
      },
      maxRetries: 10,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toBe(false);
    expect(launchCalled).toBe(true);
    expect(notifyCalls).toBe(2); // stopped after error, didn't exhaust retries
  });
});
