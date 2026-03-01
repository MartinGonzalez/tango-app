import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { scaffold, type ScaffoldOptions } from "../src/scaffold.ts";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

function defaultOptions(dir: string): ScaffoldOptions {
  return {
    name: "Test Instrument",
    id: "test-instrument",
    dir,
    panels: { sidebar: true, first: true, second: false, right: false },
    includeBackend: false,
    apiPath: "../api",
  };
}

describe("scaffold", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "scaffold-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("generates package.json with @tango/api dependency", async () => {
    const options = defaultOptions(tmpDir);
    await scaffold(options);

    const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8"));
    expect(pkg.dependencies).toHaveProperty("@tango/api");
    expect(pkg.dependencies["@tango/api"]).toBe("file:../api");
    // Should NOT have sdk or ui as direct dependencies
    expect(pkg.dependencies).not.toHaveProperty("@tango/instrument-sdk");
    expect(pkg.dependencies).not.toHaveProperty("@tango/instrument-ui");
  });

  test("frontend imports from @tango/api", async () => {
    const options = defaultOptions(tmpDir);
    await scaffold(options);

    const content = await readFile(join(tmpDir, "src/index.tsx"), "utf8");
    expect(content).toContain('from "@tango/api"');
    // Should NOT import from sdk or ui directly
    expect(content).not.toContain("@tango/instrument-sdk");
    expect(content).not.toContain("@tango/instrument-ui");
  });

  test("backend imports from @tango/api/backend", async () => {
    const options = { ...defaultOptions(tmpDir), includeBackend: true };
    await scaffold(options);

    const content = await readFile(join(tmpDir, "src/backend.ts"), "utf8");
    expect(content).toContain('from "@tango/api/backend"');
    // Should NOT import from sdk directly
    expect(content).not.toContain("@tango/instrument-sdk");
  });

  test("does not generate backend.ts when includeBackend is false", async () => {
    const options = defaultOptions(tmpDir);
    const created = await scaffold(options);

    expect(created).not.toContain("src/backend.ts");
  });

  test("generates correct panel components", async () => {
    const options = defaultOptions(tmpDir);
    await scaffold(options);

    const content = await readFile(join(tmpDir, "src/index.tsx"), "utf8");
    expect(content).toContain("SidebarPanel");
    expect(content).toContain("FirstPanel");
    // second and right are disabled
    expect(content).not.toContain("SecondPanel");
    expect(content).not.toContain("RightPanel");
  });

  test("returns list of created files", async () => {
    const options = { ...defaultOptions(tmpDir), includeBackend: true };
    const created = await scaffold(options);

    expect(created).toContain("package.json");
    expect(created).toContain("tsconfig.json");
    expect(created).toContain(".gitignore");
    expect(created).toContain("src/index.tsx");
    expect(created).toContain("src/backend.ts");
  });

  test("uses apiPath for dependency resolution", async () => {
    const options = { ...defaultOptions(tmpDir), apiPath: "../../packages/api" };
    await scaffold(options);

    const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8"));
    expect(pkg.dependencies["@tango/api"]).toBe("file:../../packages/api");
  });
});
