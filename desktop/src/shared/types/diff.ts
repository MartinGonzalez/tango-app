export type DiffFile = {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  hunks: DiffHunk[];
  isBinary: boolean;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
};

export type DiffLine = {
  type: "add" | "delete" | "context";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
};

export type DiffScope = "last_turn" | "all";

export type VcsKind = "git" | "svn" | "none";

export type VcsInfo = {
  kind: VcsKind;
  branch: string | null;
};

export type StageFileContent = {
  content: string;
  truncated: boolean;
  isBinary: boolean;
};

export type BranchRefKind = "head" | "branch" | "remote" | "tag" | "other";

export type BranchRef = {
  name: string;
  label: string;
  kind: BranchRefKind;
};

export type BranchCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeTime: string;
  refs: BranchRef[];
  isHead: boolean;
  isPushed: boolean;
};

export type CommitActionMode = "commit" | "commit_and_push";

export type CommitContext = {
  isGitRepo: boolean;
  branch: string;
  hasChanges: boolean;
  stagedFiles: number;
  stagedAdditions: number;
  stagedDeletions: number;
  unstagedFiles: number;
  unstagedAdditions: number;
  unstagedDeletions: number;
  untrackedFiles: number;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
};

export type CommitExecutionResult = {
  commitHash: string;
  branch: string;
  pushed: boolean;
};
