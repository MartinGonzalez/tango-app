import { describe, expect, test } from "bun:test";
import { KeychainStore, KeychainStoreError } from "../src/bun/keychain-store.ts";

describe("KeychainStore", () => {
  test("writes and reads secret values", async () => {
    const calls: string[][] = [];
    const store = new KeychainStore(async (args) => {
      calls.push(args);
      if (args[0] === "add-generic-password") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (args[0] === "find-generic-password") {
        return { stdout: "secret-token\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    await store.setSecret("svc", "acct", "secret-token");
    const secret = await store.getSecret("svc", "acct");

    expect(secret).toBe("secret-token");
    expect(calls[0][0]).toBe("add-generic-password");
    expect(calls[1][0]).toBe("find-generic-password");
  });

  test("returns null when secret is not found", async () => {
    const store = new KeychainStore(async () => ({
      stdout: "",
      stderr: "The specified item could not be found in the keychain.",
      exitCode: 44,
    }));

    const secret = await store.getSecret("svc", "missing");
    expect(secret).toBeNull();
  });

  test("ignores delete for missing keychain item", async () => {
    const store = new KeychainStore(async () => ({
      stdout: "",
      stderr: "The specified item could not be found in the keychain.",
      exitCode: 44,
    }));

    await store.deleteSecret("svc", "missing");
    expect(true).toBe(true);
  });

  test("throws on command failures", async () => {
    const store = new KeychainStore(async () => ({
      stdout: "",
      stderr: "user interaction is not allowed",
      exitCode: 1,
    }));

    await expect(store.setSecret("svc", "acct", "value")).rejects.toBeInstanceOf(
      KeychainStoreError
    );
  });
});
