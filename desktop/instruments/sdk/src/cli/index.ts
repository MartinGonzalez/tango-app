#!/usr/bin/env bun
import { resolve } from "node:path";
import { generateEnvTypes } from "./generate-env-types.ts";

const USAGE = `Usage: tango-sdk <command> [project-path]

Commands:
  sync      Generate tango-env.d.ts from instrument settings
  build     Build the instrument (frontend + backend)
  dev       Watch, rebuild, and hot-reload on changes
  validate  Validate instrument manifest and structure
`;

export async function main(argv: string[]): Promise<void> {
  const [command, projectPath] = argv;
  const cwd = resolve(projectPath ?? process.cwd());

  switch (command) {
    case "sync": {
      const output = await generateEnvTypes(cwd);
      console.log(`Generated ${output}`);
      break;
    }

    case "build": {
      const { buildInstrument } = await import("./build.ts");
      const result = await buildInstrument(cwd);
      console.log(
        `Build complete in ${result.durationMs}ms — frontend: ${result.frontend.ok ? "ok" : "FAILED"}${result.backend ? `, backend: ${result.backend.ok ? "ok" : "FAILED"}` : ""}`
      );
      if (!result.frontend.ok || (result.backend && !result.backend.ok)) {
        process.exitCode = 1;
      }
      break;
    }

    case "dev": {
      const { devInstrument } = await import("./dev.ts");
      await devInstrument(cwd);
      break;
    }

    case "validate": {
      const { validateInstrument } = await import("./validate.ts");
      const errors = await validateInstrument(cwd);
      if (errors.length === 0) {
        console.log("Validation passed.");
      } else {
        console.error(`Validation found ${errors.length} error(s):`);
        for (const error of errors) {
          console.error(`  ${error.field}: ${error.message}`);
        }
        process.exitCode = 1;
      }
      break;
    }

    default:
      console.error(USAGE);
      process.exitCode = 1;
      break;
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
