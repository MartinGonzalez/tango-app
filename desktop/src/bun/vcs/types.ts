import type { BranchCommit, DiffFile } from "../../shared/types.ts";

export type VcsKind = "git" | "svn" | "none";

export type VcsInfo = {
  kind: VcsKind;
  branch: string | null;
};

export interface VcsStrategy {
  readonly kind: VcsKind;
  getBranch(cwd: string): Promise<string | null>;
  getBranchHistory(cwd: string, limit?: number): Promise<BranchCommit[]>;
  getCommitDiff(cwd: string, commitHash: string): Promise<DiffFile[]>;
  getWorkingTreeDiff(cwd: string): Promise<DiffFile[]>;
}
