import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { InstrumentSettingField } from "../types/instruments.ts";

type PackageJsonLike = {
  tango?: {
    instrument?: {
      settings?: InstrumentSettingField[];
    };
  };
};

function toTsType(field: InstrumentSettingField): string {
  if (field.type === "string") return "string";
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "select") {
    const literals = field.options.map((option) => JSON.stringify(option.value));
    return literals.length ? literals.join(" | ") : "string";
  }
  return "unknown";
}

function buildDefinition(settings: InstrumentSettingField[]): string {
  const lines = settings.map((field) => {
    const optional = field.required ? "" : "?";
    return `    ${field.key}${optional}: ${toTsType(field)};`;
  });
  return [
    "declare namespace TangoSettings {",
    "  type Instrument = {",
    ...(lines.length ? lines : ["    [key: string]: unknown;"]),
    "  };",
    "}",
    "",
  ].join("\n");
}

export async function generateEnvTypes(projectDir: string): Promise<string> {
  const cwd = resolve(projectDir);
  const packagePath = join(cwd, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonLike;
  const settings = parsed.tango?.instrument?.settings ?? [];
  const definition = buildDefinition(settings);
  const outputPath = join(cwd, "tango-env.d.ts");
  await writeFile(outputPath, definition, "utf8");
  return outputPath;
}
