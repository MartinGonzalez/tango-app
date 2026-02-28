import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tasksDir = resolve(scriptDir, "..");

const files = [
  resolve(tasksDir, "dist/index.js"),
  resolve(tasksDir, "dist/backend.js"),
];

const forbidden = [
  "../../../src/",
  "../../../../src/",
  "from \"../src/",
  "from './src/",
];

const failures = [];

for (const filePath of files) {
  const source = await readFile(filePath, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      failures.push(`${filePath} contains forbidden reference: ${token}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Portable verification passed.");
