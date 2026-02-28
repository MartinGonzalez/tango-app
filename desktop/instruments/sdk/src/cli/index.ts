#!/usr/bin/env bun
import { resolve } from "node:path";
import { generateEnvTypes } from "./generate-env-types.ts";

export async function main(argv: string[]): Promise<void> {
  const [command, projectPath] = argv;
  if (command !== "sync") {
    console.error("Usage: tango-sdk sync [project-path]");
    process.exitCode = 1;
    return;
  }

  const cwd = resolve(projectPath ?? process.cwd());
  const output = await generateEnvTypes(cwd);
  console.log(`Generated ${output}`);
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
