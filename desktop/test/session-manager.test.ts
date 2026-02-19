import { describe, test, expect } from "bun:test";
import { SessionManager } from "../src/bun/session-manager.ts";

describe("SessionManager", () => {
  test("getActive returns empty array initially", () => {
    const sm = new SessionManager();
    expect(sm.getActive()).toEqual([]);
  });

  test("isAppSpawned returns false for unknown session", () => {
    const sm = new SessionManager();
    expect(sm.isAppSpawned("nonexistent")).toBe(false);
  });

  test("kill returns false for unknown session", () => {
    const sm = new SessionManager();
    expect(sm.kill("nonexistent")).toBe(false);
  });

  test("onEvent and onEnd are chainable", () => {
    const sm = new SessionManager();
    const result = sm.onEvent(() => {}).onEnd(() => {});
    expect(result).toBe(sm);
  });

  // Note: Full spawn/stream tests would require mocking Bun.spawn.
  // The spawn method itself calls Bun.spawn with ["claude", "-p", prompt, "--output-format", "stream-json"]
  // which requires claude CLI to be installed. Integration testing is handled separately.
});
