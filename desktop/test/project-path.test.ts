import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getWorkspacePathVariants,
  getWorkspacePathVariantsSync,
} from "../src/bun/project-path.ts";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "project-path-test-"));
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {}
});

describe("project-path helpers", () => {
  test("encodeClaudeProjectPath normalizes dots and path separators", () => {
    const encoded = encodeClaudeProjectPath(
      "/Users/me/Workspace/Packages/com.example.feature"
    );
    expect(encoded).toBe("-Users-me-Workspace-Packages-com-example-feature");
  });

  test("legacy encoder keeps dots for backward compatibility", () => {
    const encoded = encodeClaudeProjectPathLegacy(
      "/Users/me/Workspace/Packages/com.example.feature"
    );
    expect(encoded).toBe("-Users-me-Workspace-Packages-com.example.feature");
  });

  test("path variants include canonical realpath for symlinked workspaces", async () => {
    const realDir = join(tempDir, "real.workspace");
    const linkDir = join(tempDir, "link.workspace");
    await mkdir(realDir, { recursive: true });
    await symlink(realDir, linkDir);

    const expectedReal = await realpath(linkDir);
    const asyncVariants = await getWorkspacePathVariants(linkDir);
    const syncVariants = getWorkspacePathVariantsSync(linkDir);

    expect(asyncVariants).toContain(linkDir);
    expect(asyncVariants).toContain(expectedReal);
    expect(syncVariants).toContain(linkDir);
    expect(syncVariants).toContain(expectedReal);
  });
});
