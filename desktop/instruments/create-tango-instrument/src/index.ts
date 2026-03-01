#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { resolve, relative, dirname } from "node:path";
import { scaffold, type ScaffoldOptions } from "./scaffold.ts";

const PANEL_SLOTS = ["sidebar", "first", "second", "right"] as const;

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

async function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || (defaultValue ?? "");
}

async function promptYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? " (Y/n)" : " (y/N)";
  const answer = await rl.question(`${question}${suffix}: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultValue;
  return trimmed === "y" || trimmed === "yes";
}

async function promptPanels(
  rl: ReturnType<typeof createInterface>
): Promise<ScaffoldOptions["panels"]> {
  console.log("\nWhich panels? (comma-separated, e.g. sidebar,second)");
  console.log(`  Available: ${PANEL_SLOTS.join(", ")}`);
  const answer = await prompt(rl, "Panels", "sidebar,second");
  const selected = answer.split(",").map((s) => s.trim().toLowerCase());

  return {
    sidebar: selected.includes("sidebar"),
    first: selected.includes("first"),
    second: selected.includes("second"),
    right: selected.includes("right"),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetDir = args[0];

  if (!targetDir) {
    console.error("Usage: create-tango-instrument <directory>");
    process.exitCode = 1;
    return;
  }

  const dir = resolve(targetDir);
  const dirName = dir.split("/").pop() ?? targetDir;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("\nCreate Tango Instrument\n");

    const name = await prompt(rl, "Instrument name", dirName);
    const id = await prompt(rl, "Instrument ID", toKebabCase(name));
    const panels = await promptPanels(rl);
    const includeBackend = await promptYesNo(rl, "Include backend?", true);

    // Resolve @tango/api path relative to the target directory
    const thisDir = dirname(new URL(import.meta.url).pathname);
    const apiPath = relative(dir, resolve(thisDir, "../../api"));

    console.log("\nScaffolding...");

    const created = await scaffold({
      name,
      id,
      dir,
      panels,
      includeBackend,
      apiPath,
    });

    console.log(`\nCreated ${created.length} files:`);
    for (const file of created) {
      console.log(`  ${file}`);
    }

    console.log(`\nNext steps:`);
    console.log(`  cd ${targetDir}`);
    console.log(`  bun install`);
    console.log(`  bun run dev`);
    console.log();
  } finally {
    rl.close();
  }
}

if (import.meta.main) {
  await main();
}
