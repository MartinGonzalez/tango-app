import { readFile, watch, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { buildInstrument } from "./build.ts";
import { generateEnvTypes } from "./generate-env-types.ts";

const DEV_RELOAD_URL = "http://localhost:4243/api/instruments/dev-reload";
const DEBOUNCE_MS = 300;

type InstrumentManifestLike = {
  id?: string;
};

type PackageJsonLike = {
  tango?: {
    instrument?: InstrumentManifestLike;
  };
};

async function readInstrumentId(cwd: string): Promise<string> {
  const packagePath = join(cwd, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonLike;
  const id = parsed.tango?.instrument?.id;
  if (!id) {
    throw new Error("Missing tango.instrument.id in package.json");
  }
  return id;
}

/**
 * Result of a notify attempt.
 * - "ok": server responded 2xx
 * - "unreachable": connection refused / network error
 * - "error": server responded but with an error (don't retry — Tango is running, the problem is elsewhere)
 */
export type NotifyResult = "ok" | "unreachable" | "error";

async function notifyReload(instrumentId: string, installPath: string): Promise<NotifyResult> {
  try {
    const resp = await fetch(DEV_RELOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrumentId, installPath }),
    });
    if (resp.ok) return "ok";
    // Server responded but with error — log it
    try {
      const body = await resp.json() as { message?: string };
      console.error(`[tango-sdk dev] Server error: ${body.message ?? resp.statusText}`);
    } catch {
      console.error(`[tango-sdk dev] Server error: ${resp.status} ${resp.statusText}`);
    }
    return "error";
  } catch {
    return "unreachable";
  }
}

async function launchTango(): Promise<void> {
  const { exec } = await import("node:child_process");
  return new Promise<void>((resolve) => {
    exec("open -a Tango", (err) => {
      if (!err) return resolve();
      exec("open -a Tango-dev", () => resolve());
    });
  });
}

export type NotifyReloadWithRetryOptions = {
  instrumentId: string;
  installPath: string;
  notify?: (instrumentId: string, installPath: string) => Promise<NotifyResult>;
  launch?: () => Promise<void>;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

/**
 * Tries to notify the host. On first failure, launches Tango and retries
 * with exponential backoff. Stops retrying if the server responds with an
 * error (server is running but something else is wrong).
 */
export async function notifyReloadWithRetry(opts: NotifyReloadWithRetryOptions): Promise<boolean> {
  const {
    instrumentId,
    installPath,
    notify: notifyFn = notifyReload,
    launch: launchFn = launchTango,
    maxRetries = 10,
    initialDelayMs = 500,
    maxDelayMs = 5000,
  } = opts;

  // First attempt
  const first = await notifyFn(instrumentId, installPath);
  if (first === "ok") return true;
  if (first === "error") return false; // Server running but errored — no point retrying

  // Unreachable — launch Tango and retry
  console.log("[tango-sdk dev] Launching Tango...");
  await launchFn();

  let delay = initialDelayMs;
  for (let i = 0; i < maxRetries; i++) {
    await sleep(delay);
    const result = await notifyFn(instrumentId, installPath);
    if (result === "ok") return true;
    if (result === "error") return false; // Server came up but errored
    // Still unreachable — keep waiting
    console.log(`[tango-sdk dev] Waiting for Tango... (attempt ${i + 2}/${maxRetries + 1})`);
    delay = Math.min(delay * 2, maxDelayMs);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function devInstrument(projectDir: string): Promise<void> {
  const cwd = resolve(projectDir);
  const instrumentId = await readInstrumentId(cwd);
  const srcDir = join(cwd, "src");

  console.log(`[tango-sdk dev] Instrument: ${instrumentId}`);
  console.log(`[tango-sdk dev] Project: ${cwd}`);

  // Step 1: Sync dependencies (clear Bun cache + reinstall to refresh file: deps)
  console.log("[tango-sdk dev] Syncing dependencies...");
  try {
    await rm(join(cwd, "node_modules", ".bun"), { recursive: true, force: true });
    execSync("bun install", { cwd, stdio: "pipe" });
  } catch (err) {
    console.warn(`[tango-sdk dev] Warning: dependency sync failed: ${err}`);
  }

  // Step 2: Generate env types
  try {
    const envPath = await generateEnvTypes(cwd);
    console.log(`[tango-sdk dev] Generated ${envPath}`);
  } catch (err) {
    console.warn(`[tango-sdk dev] Warning: env types generation failed: ${err}`);
  }

  // Step 3: Initial build
  console.log("[tango-sdk dev] Building...");
  try {
    const result = await buildInstrument(cwd);
    console.log(`[tango-sdk dev] Built in ${result.durationMs}ms`);
  } catch (err) {
    console.error(`[tango-sdk dev] Initial build failed: ${err}`);
    console.log("[tango-sdk dev] Watching for changes...");
  }

  // Step 4: Notify host with retry + auto-launch
  console.log("[tango-sdk dev] Connecting to Tango...");
  const reloaded = await notifyReloadWithRetry({
    instrumentId,
    installPath: cwd,
  });
  if (reloaded) {
    console.log("[tango-sdk dev] Installed and reloaded in Tango");
  } else {
    console.log("[tango-sdk dev] Could not connect to Tango (will retry on changes)");
  }

  // Step 5: Watch for changes
  console.log(`[tango-sdk dev] Watching ${srcDir}...`);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let building = false;

  async function rebuild(): Promise<void> {
    if (building) return;
    building = true;
    const start = Date.now();
    try {
      const result = await buildInstrument(cwd);
      const notified = await notifyReload(instrumentId, cwd);
      const elapsed = Date.now() - start;
      console.log(
        `[tango-sdk dev] Rebuilt in ${elapsed}ms.${notified === "ok" ? " Reloaded." : ""}`
      );
    } catch (err) {
      console.error(`[tango-sdk dev] Build error: ${err}`);
    } finally {
      building = false;
    }
  }

  try {
    const watcher = watch(srcDir, { recursive: true });
    for await (const event of watcher) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void rebuild();
      }, DEBOUNCE_MS);
    }
  } catch (err) {
    console.error(`[tango-sdk dev] Watch error: ${err}`);
    process.exit(1);
  }
}
