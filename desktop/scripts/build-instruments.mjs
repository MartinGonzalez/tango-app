#!/usr/bin/env node
/**
 * Builds all bundled instruments that have a tango.instrument manifest
 * and a "build" script in their package.json.
 *
 * Clears the Bun cache first to ensure file: deps are fresh,
 * then runs builds in parallel for speed.
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const instrumentsDir = resolve(import.meta.dirname, "../instruments");

function isInstrumentWithBuild(dir) {
  const pkgPath = join(dir, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return Boolean(pkg.tango?.instrument && pkg.scripts?.build);
  } catch {
    return false;
  }
}

const dirs = readdirSync(instrumentsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => resolve(instrumentsDir, d.name))
  .filter(isInstrumentWithBuild);

if (dirs.length === 0) {
  console.log("[build-instruments] No instruments to build");
  process.exit(0);
}

// Clear Bun's .bun cache so file: deps are re-resolved from source
const bunCache = join(instrumentsDir, "node_modules", ".bun");
try {
  rmSync(bunCache, { recursive: true, force: true });
  execSync("bun install", { cwd: instrumentsDir, stdio: "pipe" });
} catch (err) {
  console.warn(`[build-instruments] Warning: cache refresh failed: ${err.message}`);
}

console.log(`[build-instruments] Building ${dirs.length} instrument(s)...`);

const results = await Promise.allSettled(
  dirs.map(async (dir) => {
    const name = dir.split("/").pop();
    const start = Date.now();
    try {
      execSync("bun run build", { cwd: dir, stdio: "pipe" });
      const ms = Date.now() - start;
      console.log(`  ✓ ${name} (${ms}ms)`);
      return { name, ok: true };
    } catch (err) {
      const ms = Date.now() - start;
      console.error(`  ✗ ${name} (${ms}ms): ${err.message}`);
      return { name, ok: false };
    }
  })
);

const failed = results.filter((r) => r.status === "rejected" || !r.value?.ok);
if (failed.length > 0) {
  console.error(`[build-instruments] ${failed.length} build(s) failed`);
  process.exit(1);
}

console.log("[build-instruments] Done");
