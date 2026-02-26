import type { BranchCommit, DiffFile } from "../../shared/types.ts";
import type { VcsStrategy } from "./types.ts";

export class NoneStrategy implements VcsStrategy {
  readonly kind = "none" as const;

  async getBranch(): Promise<null> {
    return null;
  }

  async getBranchHistory(): Promise<BranchCommit[]> {
    return [];
  }

  async getCommitDiff(): Promise<DiffFile[]> {
    return [];
  }

  async getWorkingTreeDiff(): Promise<DiffFile[]> {
    return [];
  }
}
