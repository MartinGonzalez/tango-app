import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Subprocess } from "bun";

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
  return tsxPath;
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
  const args = [
    "bun",
    "build",
    src,
    "--outfile",
    outfile,
    "--format",
    "esm",
    "--target",
    target,
  ];

  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`Build failed for ${src}:\n${stderr}`);
    return { path: outfile, ok: false };
  }

  return { path: outfile, ok: true };
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
