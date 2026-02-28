import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { InstrumentPermission } from "../types/instruments.ts";

type PackageJsonLike = {
  tango?: {
    instrument?: Record<string, unknown>;
  };
};

const VALID_PERMISSIONS: InstrumentPermission[] = [
  "storage.files",
  "storage.db",
  "storage.properties",
  "sessions",
  "connectors.read",
  "connectors.credentials.read",
  "connectors.connect",
  "stages.read",
  "stages.observe",
];

const VALID_PANEL_SLOTS = ["sidebar", "first", "second", "right"];

export type ValidationError = {
  field: string;
  message: string;
};

export async function validateInstrument(projectDir: string): Promise<ValidationError[]> {
  const cwd = resolve(projectDir);
  const errors: ValidationError[] = [];

  // Read package.json
  let manifest: Record<string, unknown>;
  try {
    const packagePath = join(cwd, "package.json");
    const raw = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(raw) as PackageJsonLike;
    if (!parsed.tango?.instrument) {
      return [{ field: "tango.instrument", message: "Missing tango.instrument in package.json" }];
    }
    manifest = parsed.tango.instrument;
  } catch (err) {
    return [{ field: "package.json", message: `Cannot read package.json: ${err}` }];
  }

  // Required fields
  if (!manifest.id || typeof manifest.id !== "string") {
    errors.push({ field: "id", message: "Missing or invalid 'id' (must be a string)" });
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push({ field: "name", message: "Missing or invalid 'name' (must be a string)" });
  }
  if (!manifest.entrypoint || typeof manifest.entrypoint !== "string") {
    errors.push({ field: "entrypoint", message: "Missing or invalid 'entrypoint' (must be a string)" });
  }

  // Panels
  if (!manifest.panels || typeof manifest.panels !== "object") {
    errors.push({ field: "panels", message: "Missing or invalid 'panels' (must be an object)" });
  } else {
    const panels = manifest.panels as Record<string, unknown>;
    const hasAtLeastOne = VALID_PANEL_SLOTS.some((slot) => panels[slot] === true);
    if (!hasAtLeastOne) {
      errors.push({ field: "panels", message: "At least one panel slot must be true" });
    }
    for (const [key, value] of Object.entries(panels)) {
      if (!VALID_PANEL_SLOTS.includes(key)) {
        errors.push({ field: `panels.${key}`, message: `Unknown panel slot '${key}'` });
      } else if (typeof value !== "boolean") {
        errors.push({ field: `panels.${key}`, message: `Panel '${key}' must be a boolean` });
      }
    }
  }

  // Entrypoint file exists (check src/ version)
  if (typeof manifest.entrypoint === "string") {
    const srcPath = manifest.entrypoint
      .replace(/^\.\/dist\//, "./src/")
      .replace(/\.js$/, ".tsx");
    const tsxPath = resolve(cwd, srcPath);
    const tsPath = tsxPath.replace(/\.tsx$/, ".ts");
    try {
      await access(tsxPath);
    } catch {
      try {
        await access(tsPath);
      } catch {
        errors.push({
          field: "entrypoint",
          message: `Source file not found: ${srcPath} or ${srcPath.replace(/\.tsx$/, ".ts")}`,
        });
      }
    }
  }

  // Permissions
  if (manifest.permissions != null) {
    if (!Array.isArray(manifest.permissions)) {
      errors.push({ field: "permissions", message: "'permissions' must be an array" });
    } else {
      for (const perm of manifest.permissions) {
        if (!VALID_PERMISSIONS.includes(perm as InstrumentPermission)) {
          errors.push({
            field: "permissions",
            message: `Invalid permission '${perm}'. Valid: ${VALID_PERMISSIONS.join(", ")}`,
          });
        }
      }
    }
  }

  // Settings schema
  if (manifest.settings != null) {
    if (!Array.isArray(manifest.settings)) {
      errors.push({ field: "settings", message: "'settings' must be an array" });
    } else {
      for (let i = 0; i < manifest.settings.length; i++) {
        const setting = manifest.settings[i] as Record<string, unknown> | undefined;
        if (!setting || typeof setting !== "object") {
          errors.push({ field: `settings[${i}]`, message: "Each setting must be an object" });
          continue;
        }
        if (!setting.key || typeof setting.key !== "string") {
          errors.push({ field: `settings[${i}].key`, message: "Missing or invalid 'key'" });
        }
        if (!setting.title || typeof setting.title !== "string") {
          errors.push({ field: `settings[${i}].title`, message: "Missing or invalid 'title'" });
        }
        const validTypes = ["string", "number", "boolean", "select"];
        if (!setting.type || !validTypes.includes(String(setting.type))) {
          errors.push({
            field: `settings[${i}].type`,
            message: `Invalid type '${setting.type}'. Valid: ${validTypes.join(", ")}`,
          });
        }
        if (setting.type === "select") {
          const options = setting.options;
          if (!Array.isArray(options) || options.length === 0) {
            errors.push({
              field: `settings[${i}].options`,
              message: "Select settings must have a non-empty 'options' array",
            });
          }
        }
      }
    }
  }

  return errors;
}
