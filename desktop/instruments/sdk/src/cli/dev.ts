import { readFile, watch } from "node:fs/promises";
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

async function notifyReload(instrumentId: string, installPath: string): Promise<boolean> {
  try {
    const resp = await fetch(DEV_RELOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrumentId, installPath }),
    });
    return resp.ok;
  } catch {
    // Host not running — that's fine
    return false;
  }
}

export async function devInstrument(projectDir: string): Promise<void> {
  const cwd = resolve(projectDir);
  const instrumentId = await readInstrumentId(cwd);
  const srcDir = join(cwd, "src");

  console.log(`[tango-sdk dev] Instrument: ${instrumentId}`);
  console.log(`[tango-sdk dev] Project: ${cwd}`);

  // Step 1: Generate env types
  try {
    const envPath = await generateEnvTypes(cwd);
    console.log(`[tango-sdk dev] Generated ${envPath}`);
  } catch (err) {
    console.warn(`[tango-sdk dev] Warning: env types generation failed: ${err}`);
  }

  // Step 2: Initial build
  console.log("[tango-sdk dev] Building...");
  try {
    const result = await buildInstrument(cwd);
    console.log(`[tango-sdk dev] Built in ${result.durationMs}ms`);
  } catch (err) {
    console.error(`[tango-sdk dev] Initial build failed: ${err}`);
    console.log("[tango-sdk dev] Watching for changes...");
  }

  // Step 3: Notify host
  const reloaded = await notifyReload(instrumentId, cwd);
  if (reloaded) {
    console.log("[tango-sdk dev] Reloaded in host");
  } else {
    console.log("[tango-sdk dev] Host not available (will retry on changes)");
  }

  // Step 4: Watch for changes
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
        `[tango-sdk dev] Rebuilt in ${elapsed}ms.${notified ? " Reloaded." : ""}`
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
