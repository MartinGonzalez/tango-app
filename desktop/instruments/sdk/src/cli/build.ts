import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type InstrumentManifestLike = {
  runtime?: string;
  entrypoint?: string;
  backendEntrypoint?: string;
};

type PackageJsonLike = {
  tango?: {
    instrument?: InstrumentManifestLike;
  };
};

export type BuildResult = {
  frontend: { path: string; ok: boolean };
  backend: { path: string; ok: boolean } | null;
  durationMs: number;
};

async function readManifest(cwd: string): Promise<InstrumentManifestLike> {
  const packagePath = join(cwd, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonLike;
  const manifest = parsed.tango?.instrument;
  if (!manifest) {
    throw new Error("Missing tango.instrument in package.json");
  }
  return manifest;
}

function resolveSource(cwd: string, entrypoint: string): string {
  // Convert dist entrypoints back to src for build
  const srcPath = entrypoint
    .replace(/^\.\/dist\//, "./src/")
    .replace(/\.js$/, ".tsx")
    .replace(/\.tsx\.tsx$/, ".tsx"); // prevent double extension
  // Try tsx first, fallback to ts
  const tsxPath = resolve(cwd, srcPath);
  const tsPath = tsxPath.replace(/\.tsx$/, ".ts");
  if (existsSync(tsxPath)) return tsxPath;
  return tsPath;
}

/**
 * Resolve the canonical path to a React package, ensuring a single copy.
 * Looks up from the SDK directory first, then falls back to the project cwd.
 */
function resolveReactPackagePath(packageName: string, cwd: string): string | null {
  const sdkDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const candidates = [
    join(sdkDir, "node_modules", packageName),
    join(resolve(sdkDir, ".."), "node_modules", packageName),
    join(cwd, "node_modules", packageName),
  ];
  for (const candidate of candidates) {
    try {
      const pkgPath = join(candidate, "package.json");
      // Sync check — build is already async, but Bun.plugin needs sync filter
      const file = Bun.file(pkgPath);
      if (file.size > 0) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export async function buildInstrument(projectDir: string): Promise<BuildResult> {
  const cwd = resolve(projectDir);
  const start = Date.now();
  const manifest = await readManifest(cwd);

  if (!manifest.entrypoint) {
    throw new Error("Missing tango.instrument.entrypoint in package.json");
  }

  // Build frontend
  const frontendSrc = resolveSource(cwd, manifest.entrypoint);
  const frontendOut = resolve(cwd, manifest.entrypoint);
  const frontendResult = await runBunBuild(cwd, frontendSrc, frontendOut, "browser");

  // Build backend (if configured)
  let backendResult: BuildResult["backend"] = null;
  if (manifest.backendEntrypoint) {
    const backendSrc = resolveSource(cwd, manifest.backendEntrypoint);
    const backendOut = resolve(cwd, manifest.backendEntrypoint);
    backendResult = {
      path: backendOut,
      ok: await runBunBuild(cwd, backendSrc, backendOut, "bun").then(
        (r) => r.ok
      ),
    };
  }

  const durationMs = Date.now() - start;

  // Verify portable (no host path references in output)
  if (frontendResult.ok) {
    await verifyPortable(frontendOut);
  }
  if (backendResult?.ok) {
    await verifyPortable(resolve(cwd, manifest.backendEntrypoint!));
  }

  return {
    frontend: frontendResult,
    backend: backendResult,
    durationMs,
  };
}

async function runBunBuild(
  cwd: string,
  src: string,
  outfile: string,
  target: "browser" | "bun"
): Promise<{ path: string; ok: boolean }> {
  // Resolve React to a single canonical path to prevent duplicate
  // React instances when SDK and instrument have separate node_modules.
  const canonicalReact = resolveReactPackagePath("react", cwd);

  const plugins = canonicalReact
    ? [createReactDedupePlugin(canonicalReact)]
    : [];

  try {
    const result = await Bun.build({
      entrypoints: [src],
      outdir: dirname(outfile),
      naming: "[name].[ext]",
      format: "esm",
      target,
      plugins,
    });

    if (!result.success) {
      for (const log of result.logs) {
        console.error(log);
      }
      return { path: outfile, ok: false };
    }

    return { path: outfile, ok: true };
  } catch (err) {
    console.error(`Build failed for ${src}:`, err);
    return { path: outfile, ok: false };
  }
}

/**
 * Bun plugin that redirects all react/react-dom imports to a single
 * canonical package directory, preventing duplicate React bundles.
 */
function createReactDedupePlugin(canonicalReactDir: string) {
  // Pre-resolve the react-dom directory relative to the canonical react
  const reactDomDir = join(dirname(canonicalReactDir), "react-dom");

  // Map bare specifiers to their canonical file paths
  const aliases: Record<string, string> = {
    "react": join(canonicalReactDir, "index.js"),
    "react/jsx-runtime": join(canonicalReactDir, "jsx-runtime.js"),
    "react/jsx-dev-runtime": join(canonicalReactDir, "jsx-dev-runtime.js"),
    "react-dom": join(reactDomDir, "index.js"),
    "react-dom/client": join(reactDomDir, "client.js"),
  };

  return {
    name: "react-dedupe",
    setup(build: any) {
      for (const [specifier, filePath] of Object.entries(aliases)) {
        const escaped = specifier.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
        build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => {
          return { path: filePath };
        });
      }
    },
  };
}

async function verifyPortable(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  // Check for host-relative paths that would break portability
  const hostPathPattern = /\.\.\/\.\.\/\.\.\/src\//;
  if (hostPathPattern.test(content)) {
    throw new Error(
      `Portability check failed for ${filePath}: contains host-relative paths`
    );
  }
}
