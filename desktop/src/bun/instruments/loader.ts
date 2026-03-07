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
  const runtime = base.runtime === "react" ? "react" : "vanilla";
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

  const settings = Array.isArray(base.settings)
    ? base.settings
      .map((field) => normalizeSettingField(field))
      .filter((field): field is NonNullable<typeof field> => Boolean(field))
    : [];

  const launcher = base.launcher && typeof base.launcher === "object"
    ? {
        sidebarShortcut: base.launcher.sidebarShortcut && typeof base.launcher.sidebarShortcut === "object"
          ? {
              enabled: Boolean(base.launcher.sidebarShortcut.enabled),
              ...(base.launcher.sidebarShortcut.label
                ? { label: String(base.launcher.sidebarShortcut.label).trim() }
                : {}),
              ...(base.launcher.sidebarShortcut.icon
                ? { icon: String(base.launcher.sidebarShortcut.icon).trim() }
                : {}),
              ...(Number.isFinite(Number(base.launcher.sidebarShortcut.order))
                ? { order: Number(base.launcher.sidebarShortcut.order) }
                : {}),
            }
          : undefined,
      }
    : undefined;

  const backgroundRefresh = base.backgroundRefresh
    && typeof base.backgroundRefresh === "object"
    && base.backgroundRefresh.enabled === true
    ? {
        enabled: true as const,
        intervalSeconds: Math.max(10, Number(base.backgroundRefresh.intervalSeconds) || 30),
      }
    : undefined;

  const manifest: InstrumentManifest = {
    id,
    name,
    group,
    runtime,
    entrypoint,
    ...(backendEntrypoint ? { backendEntrypoint } : {}),
    hostApiVersion,
    panels,
    permissions,
    settings,
    ...(launcher ? { launcher } : {}),
    ...(backgroundRefresh ? { backgroundRefresh } : {}),
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

function normalizeSettingField(raw: unknown): InstrumentManifest["settings"][number] | null {
  if (!raw || typeof raw !== "object") return null;
  const field = raw as Record<string, unknown>;
  const type = String(field.type ?? "").trim();
  const key = String(field.key ?? "").trim();
  const title = String(field.title ?? "").trim();
  if (!key || !title) return null;

  const base = {
    key,
    title,
    ...(field.description ? { description: String(field.description).trim() } : {}),
    ...(typeof field.required === "boolean" ? { required: field.required } : {}),
    ...(typeof field.secret === "boolean" ? { secret: field.secret } : {}),
  };

  if (type === "string") {
    return {
      ...base,
      type: "string",
      ...(typeof field.default === "string" ? { default: field.default } : {}),
      ...(typeof field.placeholder === "string" ? { placeholder: field.placeholder } : {}),
    };
  }

  if (type === "number") {
    return {
      ...base,
      type: "number",
      ...(Number.isFinite(Number(field.default)) ? { default: Number(field.default) } : {}),
      ...(Number.isFinite(Number(field.min)) ? { min: Number(field.min) } : {}),
      ...(Number.isFinite(Number(field.max)) ? { max: Number(field.max) } : {}),
      ...(Number.isFinite(Number(field.step)) ? { step: Number(field.step) } : {}),
    };
  }

  if (type === "boolean") {
    return {
      ...base,
      type: "boolean",
      ...(typeof field.default === "boolean" ? { default: field.default } : {}),
    };
  }

  if (type === "select") {
    const options = Array.isArray(field.options)
      ? field.options
        .map((option) => {
          if (!option || typeof option !== "object") return null;
          const item = option as Record<string, unknown>;
          const value = String(item.value ?? "").trim();
          const label = String(item.label ?? value).trim();
          if (!value || !label) return null;
          return { value, label };
        })
        .filter((option): option is { value: string; label: string } => Boolean(option))
      : [];
    if (options.length === 0) return null;
    return {
      ...base,
      type: "select",
      options,
      ...(typeof field.default === "string" ? { default: field.default } : {}),
    };
  }

  return null;
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
