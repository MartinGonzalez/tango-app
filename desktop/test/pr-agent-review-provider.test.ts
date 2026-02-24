import { describe, expect, test } from "bun:test";
import {
  PRAgentReviewProvider,
  buildAgentReviewPrompt,
  parseRepoFromRemoteUrl,
} from "../src/bun/pr-agent-review-provider.ts";

describe("pr-agent-review-provider", () => {
  test("parses github repo from remote urls", () => {
    expect(parseRepoFromRemoteUrl("git@github.com:acme/repo.git")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("https://github.com/acme/repo.git")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("ssh://git@github.com/acme/repo")).toBe("acme/repo");
    expect(parseRepoFromRemoteUrl("https://example.com/acme/repo")).toBeNull();
  });

  test("builds prompt including pr-reviewer skill and output path", () => {
    const prompt = buildAgentReviewPrompt({
      repo: "acme/repo",
      number: 22,
      headSha: "abc123",
      outputFilePath: "/tmp/review.md",
      cwdSource: "workspace",
      workspacePath: "/work/acme-repo",
    });

    expect(prompt).toContain("pr-reviewer");
    expect(prompt).toContain("acme/repo");
    expect(prompt).toContain("#22");
    expect(prompt).toContain("/tmp/review.md");
    expect(prompt).toContain("/work/acme-repo");
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
