import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type ScaffoldOptions = {
  name: string;
  id: string;
  dir: string;
  panels: {
    sidebar: boolean;
    first: boolean;
    second: boolean;
    right: boolean;
  };
  includeBackend: boolean;
  apiPath: string;
};

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function panelImports(panels: ScaffoldOptions["panels"]): string {
  const slots = Object.entries(panels)
    .filter(([, enabled]) => enabled)
    .map(([slot]) => slot);
  return slots.map((slot) => `  ${slot}: ${capitalize(slot)}Panel`).join(",\n");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateFrontend(options: ScaffoldOptions): string {
  const slots = Object.entries(options.panels)
    .filter(([, enabled]) => enabled)
    .map(([slot]) => slot);

  const componentDefs = slots
    .map(
      (slot) => `function ${capitalize(slot)}Panel() {
  const api = useInstrumentApi();
  return (
    <UIRoot>
      <UIPanelHeader title="${options.name}" subtitle="${slot} panel" />
      <UISection>
        <UIEmptyState
          title="Welcome"
          description="Start building your ${options.name} instrument"
        />
      </UISection>
    </UIRoot>
  );
}`
    )
    .join("\n\n");

  return `import {
  defineReactInstrument,
  useInstrumentApi,
  UIRoot,
  UIPanelHeader,
  UISection,
  UIEmptyState,
} from "@tango/api";

${componentDefs}

export default defineReactInstrument({
  defaults: {
    visible: {
${slots.map((s) => `      ${s}: true`).join(",\n")},
    },
  },
  panels: {
${panelImports(options.panels)},
  },
});
`;
}

function generateBackend(options: ScaffoldOptions): string {
  return `import { defineBackend, type InstrumentBackendContext } from "@tango/api/backend";

async function helloAction(
  ctx: InstrumentBackendContext,
  input?: { name?: string }
): Promise<{ greeting: string }> {
  const name = input?.name ?? "world";
  return { greeting: \`Hello, \${name}!\` };
}

export default defineBackend({
  kind: "tango.instrument.backend.v2",
  actions: {
    hello: {
      input: {
        type: "object",
        properties: { name: { type: "string" } },
      },
      output: {
        type: "object",
        properties: { greeting: { type: "string" } },
        required: ["greeting"],
      },
      handler: helloAction,
    },
  },
});
`;
}

function generatePackageJson(options: ScaffoldOptions): string {
  const cli = "bun node_modules/@tango/api/src/cli.ts";
  const scripts: Record<string, string> = {
    dev: `${cli} dev`,
    build: `${cli} build`,
    sync: `${cli} sync`,
    validate: `${cli} validate`,
  };

  const deps: Record<string, string> = {
    "@tango/api": `file:${options.apiPath}`,
  };

  const devDeps: Record<string, string> = {
    "@types/react": "^18.0.0",
    typescript: "^5.0.0",
  };

  const manifest = {
    id: options.id,
    name: options.name,
    group: "Custom",
    runtime: "react",
    entrypoint: "./dist/index.js",
    ...(options.includeBackend ? { backendEntrypoint: "./dist/backend.js" } : {}),
    hostApiVersion: "2.0.0",
    launcher: {
      sidebarShortcut: {
        enabled: true,
        label: options.name,
        icon: "puzzle",
        order: 100,
      },
    },
    panels: options.panels,
    permissions: ["storage.properties"],
  };

  const pkg = {
    name: `tango-instrument-${options.id}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts,
    dependencies: deps,
    devDependencies: devDeps,
    tango: { instrument: manifest },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      allowImportingTsExtensions: true,
    },
    include: ["src"],
  };
  return JSON.stringify(config, null, 2) + "\n";
}

function generateGitignore(): string {
  return `node_modules/
dist/
tango-env.d.ts
.DS_Store
`;
}

export async function scaffold(options: ScaffoldOptions): Promise<string[]> {
  const dir = resolve(options.dir);
  const created: string[] = [];

  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "dist"), { recursive: true });

  // package.json
  await writeFile(join(dir, "package.json"), generatePackageJson(options));
  created.push("package.json");

  // tsconfig.json
  await writeFile(join(dir, "tsconfig.json"), generateTsConfig());
  created.push("tsconfig.json");

  // .gitignore
  await writeFile(join(dir, ".gitignore"), generateGitignore());
  created.push(".gitignore");

  // Frontend
  await writeFile(join(dir, "src/index.tsx"), generateFrontend(options));
  created.push("src/index.tsx");

  // Backend
  if (options.includeBackend) {
    await writeFile(join(dir, "src/backend.ts"), generateBackend(options));
    created.push("src/backend.ts");
  }

  return created;
}
