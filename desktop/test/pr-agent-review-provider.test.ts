import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PullRequestAgentReviewRun } from "../src/shared/types.ts";
import {
  PRAgentReviewProvider,
  buildAgentReviewPrompt,
  parseRepoFromRemoteUrl,
} from "../src/bun/pr-agent-review-provider.ts";

describe("pr-agent-review-provider", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claude-watcher-agent-review-provider-"));
  });

  afterEach(async () => {
    if (!tempDir) return;
    await rm(tempDir, { recursive: true, force: true });
  });

  test("parses github repo from remote urls", () => {
    expect(parseRepoFromRemoteUrl("git@github.com:acme/repo.git")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("https://github.com/acme/repo.git")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("ssh://git@github.com/acme/repo")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("https://example.com/acme/repo")).toBeNull();
  });

  test("builds strict JSON prompt without pr-reviewer dependency", () => {
    const prompt = buildAgentReviewPrompt({
      repo: "acme/repo",
      number: 22,
      headSha: "abc123",
      outputFilePath: "/tmp/review.json",
      cwdSource: "workspace",
      workspacePath: "/work/acme-repo",
    });

    expect(prompt).toContain("STRICT JSON");
    expect(prompt).toContain("final_veredic");
    expect(prompt).toContain("applied");
    expect(prompt).toContain("/tmp/review.json");
    expect(prompt).not.toContain("pr-reviewer");
  });

  test("writes placeholder and failed document as valid JSON", async () => {
    const run = createRun(join(tempDir, "acme-repo-pr22-agent-review.json"));
    const provider = new PRAgentReviewProvider({
      baseDir: tempDir,
      homeDir: tempDir,
      getWorkspacePaths: () => [],
    });

    await provider.writePlaceholder(run);
    const placeholderRaw = await readFile(run.filePath, "utf8");
    const placeholder = JSON.parse(placeholderRaw) as Record<string, unknown>;
    expect(placeholder.final_veredic).toContain("running");

    await provider.writeFailedDocument(run, "boom");
    const failedRaw = await readFile(run.filePath, "utf8");
    const failed = JSON.parse(failedRaw) as Record<string, unknown>;
    expect(failed.final_veredic).toContain("failed");
  });

  test("marks suggestion applied by index", async () => {
    const run = createRun(join(tempDir, "acme-repo-pr22-agent-review.json"));
    const provider = new PRAgentReviewProvider({
      baseDir: tempDir,
      homeDir: tempDir,
      getWorkspacePaths: () => [],
    });

    await writeFile(run.filePath, JSON.stringify({
      metadata: {
        repository: "acme/repo",
      },
      pr_summary: "summary",
      strengths: "strengths",
      improvements: "improvements",
      suggestions: [
        {
          level: "Important",
          content: "Suggestion A",
          applied: false,
        },
        {
          level: "Low",
          content: "Suggestion B",
          applied: false,
        },
      ],
      final_veredic: "final",
    }, null, 2));

    await provider.markSuggestionApplied(run, 1, true);
    const document = await provider.getDocument(run);
    expect(document?.review?.suggestions[0]?.applied).toBe(false);
    expect(document?.review?.suggestions[1]?.applied).toBe(true);
  });

  test("resolves cwd from matching workspace remote", async () => {
    const provider = new PRAgentReviewProvider({
      homeDir: "/home/dev",
      getWorkspacePaths: () => ["/work/nope", "/work/repo"],
      runCommand: async (_command, _args, cwd) => {
        if (cwd === "/work/repo") {
          return {
            stdout: "git@github.com:acme/repo.git",
            stderr: "",
            exitCode: 0,
          };
        }
        return {
          stdout: "",
          stderr: "",
          exitCode: 1,
        };
      },
    });

    const resolved = await provider.resolveCwd("acme/repo");
    expect(resolved.cwd).toBe("/work/repo");
    expect(resolved.source).toBe("workspace");
  });

  test("falls back to home cwd when no workspace matches", async () => {
    const provider = new PRAgentReviewProvider({
      homeDir: "/home/dev",
      getWorkspacePaths: () => ["/work/one"],
      runCommand: async () => ({
        stdout: "git@github.com:acme/other.git",
        stderr: "",
        exitCode: 0,
      }),
    });

    const resolved = await provider.resolveCwd("acme/repo");
    expect(resolved.cwd).toBe("/home/dev");
    expect(resolved.source).toBe("home");
  });
});

function createRun(filePath: string): PullRequestAgentReviewRun {
  return {
    id: "run-1",
    repo: "acme/repo",
    number: 22,
    version: 1,
    fileName: "acme-repo-pr22-agent-review.json",
    filePath,
    headSha: "abc123",
    status: "running",
    sessionId: "session-1",
    startedAt: "2026-02-25T00:00:00.000Z",
    updatedAt: "2026-02-25T00:00:00.000Z",
    completedAt: null,
    error: null,
  };
}
