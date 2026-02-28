import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tasksDir = resolve(scriptDir, "..");
const tasksLocalDir = resolve(tasksDir, "..", "tasks-local");

const packageJsonPath = resolve(tasksDir, "package.json");
const manifestRaw = await readFile(packageJsonPath, "utf8");
const manifest = JSON.parse(manifestRaw);

const instrument = manifest?.tango?.instrument;
if (!instrument || typeof instrument !== "object") {
  throw new Error("Invalid tasks package manifest: tango.instrument is required");
}

const nextManifest = {
  name: "@tango/instrument-tasks-local",
  version: String(manifest.version ?? "0.1.0"),
  private: true,
  type: "module",
  main: "dist/index.js",
  tango: {
    instrument: {
      ...instrument,
      id: "tasks-local",
      name: "Tasks Local",
      group: "Local",
      launcher: {
        ...(instrument.launcher ?? {}),
        sidebarShortcut: {
          ...(instrument.launcher?.sidebarShortcut ?? {}),
          enabled: true,
          label: "Tasks Local",
          icon: "task",
          order: 21,
        },
      },
    },
  },
};

await rm(tasksLocalDir, { recursive: true, force: true });
await mkdir(tasksLocalDir, { recursive: true });
await cp(resolve(tasksDir, "dist"), resolve(tasksLocalDir, "dist"), { recursive: true });
await writeFile(
  resolve(tasksLocalDir, "package.json"),
  `${JSON.stringify(nextManifest, null, 2)}\n`,
  "utf8"
);

console.log(`tasks-local generated at: ${tasksLocalDir}`);
