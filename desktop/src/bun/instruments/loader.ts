import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve, join } from "node:path";
import type { InstrumentManifest } from "../../shared/types.ts";

type PackageJson = {
  name?: string;
  version?: string;
  main?: string;
  tango?: {
    instrument?: Partial<InstrumentManifest>;
  };
};

export type LoadedInstrumentManifest = {
  manifest: InstrumentManifest;
  installPath: string;
  manifestPath: string;
  version: string;
};

export async function loadInstrumentManifest(
  installPathInput: string
): Promise<LoadedInstrumentManifest> {
  const installPath = resolve(String(installPathInput || "").trim());
  if (!installPath) {
    throw new Error("Instrument path is required");
  }

  const manifestPath = join(installPath, "package.json");
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error(`Instrument package.json not found at ${manifestPath}`);
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    throw new Error(`Invalid package.json JSON at ${manifestPath}`);
  }

  const base = pkg.tango?.instrument;
  if (!base) {
    throw new Error(`Missing tango.instrument in ${manifestPath}`);
  }

  const id = String(base.id ?? "").trim();
  if (!id) {
    throw new Error(`Instrument id is required in ${manifestPath}`);
  }

  const name = String(base.name ?? "").trim() || id;
  const group = String(base.group ?? "General").trim() || "General";
  const entrypoint = String(base.entrypoint ?? pkg.main ?? "").trim();
  if (!entrypoint) {
    throw new Error(`Instrument entrypoint is required in ${manifestPath}`);
  }

  const backendEntrypoint = base.backendEntrypoint
    ? String(base.backendEntrypoint).trim()
    : undefined;

  const hostApiVersion = String(base.hostApiVersion ?? "1.0.0").trim() || "1.0.0";
  const panels = {
    sidebar: Boolean(base.panels?.sidebar),
    first: Boolean(base.panels?.first),
    second: Boolean(base.panels?.second),
    right: Boolean(base.panels?.right),
  };

  const permissions = Array.isArray(base.permissions)
    ? base.permissions
      .map((value) => String(value).trim())
      .filter((value): value is InstrumentManifest["permissions"][number] => Boolean(value))
    : [];

  const manifest: InstrumentManifest = {
    id,
    name,
    group,
    entrypoint,
    ...(backendEntrypoint ? { backendEntrypoint } : {}),
    hostApiVersion,
    panels,
    permissions,
  };

  await assertEntrypointExists(installPath, manifest.entrypoint, "entrypoint");
  if (manifest.backendEntrypoint) {
    await assertEntrypointExists(installPath, manifest.backendEntrypoint, "backendEntrypoint");
  }

  return {
    manifest,
    installPath,
    manifestPath,
    version: String(pkg.version ?? "0.0.0").trim() || "0.0.0",
  };
}

async function assertEntrypointExists(
  installPath: string,
  relativePath: string,
  field: "entrypoint" | "backendEntrypoint"
): Promise<void> {
  const absolute = resolve(installPath, relativePath);
  try {
    await access(absolute, fsConstants.R_OK);
  } catch {
    throw new Error(`Instrument ${field} not found: ${absolute}`);
  }
}
