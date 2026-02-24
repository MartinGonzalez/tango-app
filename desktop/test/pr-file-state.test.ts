import { describe, expect, test } from "bun:test";
import {
  buildPullRequestFileReviewStateMap,
  countSeenFiles,
} from "../src/mainview/lib/pr-file-review.ts";
import type {
  PullRequestFileMeta,
  PullRequestReviewState,
} from "../src/shared/types.ts";

describe("pull request file review state", () => {
  test("marks files as seen when sha matches", () => {
    const files: PullRequestFileMeta[] = [
      {
        path: "src/app.ts",
        previousPath: null,
        status: "modified",
        additions: 1,
        deletions: 1,
        sha: "file-sha-1",
      },
    ];

    const reviewState: PullRequestReviewState = {
      repo: "acme/project",
      number: 12,
      reviewedHeadSha: "head-1",
      viewedFiles: {
        "src/app.ts": {
          sha: "file-sha-1",
          seenAt: "2026-02-24T00:00:00.000Z",
        },
      },
      updatedAt: "2026-02-24T00:00:00.000Z",
    };

    const map = buildPullRequestFileReviewStateMap(files, reviewState, "head-1");
    expect(map.get("src/app.ts")).toEqual({ seen: true, attention: null });
    expect(countSeenFiles(map)).toBe(1);
  });

  test("flags new and updated files when head sha changes", () => {
    const files: PullRequestFileMeta[] = [
      {
        path: "src/new.ts",
        previousPath: null,
        status: "added",
        additions: 10,
        deletions: 0,
        sha: "new-file-sha",
      },
      {
        path: "src/changed.ts",
        previousPath: null,
        status: "modified",
        additions: 4,
        deletions: 2,
        sha: "new-changed-sha",
      },
      {
        path: "src/same.ts",
        previousPath: null,
        status: "modified",
        additions: 0,
        deletions: 0,
        sha: "same-sha",
      },
    ];

    const reviewState: PullRequestReviewState = {
      repo: "acme/project",
      number: 99,
      reviewedHeadSha: "old-head",
      viewedFiles: {
        "src/changed.ts": {
          sha: "old-changed-sha",
          seenAt: "2026-02-24T00:00:00.000Z",
        },
        "src/same.ts": {
          sha: "same-sha",
          seenAt: "2026-02-24T00:00:00.000Z",
        },
      },
      updatedAt: "2026-02-24T00:00:00.000Z",
    };

    const map = buildPullRequestFileReviewStateMap(files, reviewState, "new-head");

    expect(map.get("src/new.ts")).toEqual({ seen: false, attention: "new" });
    expect(map.get("src/changed.ts")).toEqual({
      seen: false,
      attention: "updated",
    });
    expect(map.get("src/same.ts")).toEqual({ seen: true, attention: null });
    expect(countSeenFiles(map)).toBe(1);
  });
});
