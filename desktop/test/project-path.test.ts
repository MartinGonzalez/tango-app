import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPathLegacy,
  getStagePathVariants,
  getStagePathVariantsSync,
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
      "/Users/me/Stage/Packages/com.example.feature"
    );
    expect(encoded).toBe("-Users-me-Stage-Packages-com-example-feature");
  });

  test("legacy encoder keeps dots for backward compatibility", () => {
    const encoded = encodeClaudeProjectPathLegacy(
      "/Users/me/Stage/Packages/com.example.feature"
    );
    expect(encoded).toBe("-Users-me-Stage-Packages-com.example.feature");
  });

  test("path variants include canonical realpath for symlinked stages", async () => {
    const realDir = join(tempDir, "real.stage");
    const linkDir = join(tempDir, "link.stage");
    await mkdir(realDir, { recursive: true });
    await symlink(realDir, linkDir);

    const expectedReal = await realpath(linkDir);
    const asyncVariants = await getStagePathVariants(linkDir);
    const syncVariants = getStagePathVariantsSync(linkDir);

    expect(asyncVariants).toContain(linkDir);
    expect(asyncVariants).toContain(expectedReal);
    expect(syncVariants).toContain(linkDir);
    expect(syncVariants).toContain(expectedReal);
  });
});
