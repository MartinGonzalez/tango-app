import {
  getBranchHistory as gitGetBranchHistory,
  getCommitDiff as gitGetCommitDiff,
} from "../branch-history.ts";
import { getGitDiff } from "../diff-provider.ts";
import type { BranchCommit, DiffFile } from "../../shared/types.ts";
import type { VcsStrategy } from "./types.ts";

export class GitStrategy implements VcsStrategy {
  readonly kind = "git" as const;

  async getBranch(cwd: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        { cwd, stdout: "pipe", stderr: "ignore" }
      );
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) return null;
      const branch = output.trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  async getBranchHistory(cwd: string, limit?: number): Promise<BranchCommit[]> {
    return gitGetBranchHistory(cwd, limit);
  }

  async getCommitDiff(cwd: string, commitHash: string): Promise<DiffFile[]> {
    return gitGetCommitDiff(cwd, commitHash);
  }

  async getWorkingTreeDiff(cwd: string): Promise<DiffFile[]> {
    return getGitDiff(cwd);
  }
}
