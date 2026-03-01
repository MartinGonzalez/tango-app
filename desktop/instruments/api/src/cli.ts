#!/usr/bin/env bun
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

// Bun caches file: deps in node_modules/.bun and doesn't refresh them
// when the source package changes. Clear the cache and reinstall before
// importing the SDK so the build always runs against fresh source.
const cwd = process.cwd();
let dir = cwd;
while (dir !== dirname(dir)) {
  const bunCache = join(dir, "node_modules", ".bun");
  if (existsSync(bunCache)) {
    try {
      rmSync(bunCache, { recursive: true, force: true });
      execSync("bun install", { cwd: dir, stdio: "pipe" });
    } catch {
      // best-effort — build may still work if deps happen to be fresh
    }
    break;
  }
  dir = dirname(dir);
}

const { main } = await import("@tango/instrument-sdk/cli");
await main(process.argv.slice(2));
