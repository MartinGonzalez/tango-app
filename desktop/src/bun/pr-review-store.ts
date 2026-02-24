import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PullRequestReviewState } from "../shared/types.ts";

const DEFAULT_STORE_PATH = join(homedir(), ".claude-sessions", "pr-review-state.json");

type StoredFileState = {
  sha: string | null;
  seenAt: string;
};

type StoredReviewEntry = {
  reviewedHeadSha: string | null;
  viewedFiles: Record<string, StoredFileState>;
  updatedAt: string;
};

export class PRReviewStore {
  #filePath: string;
  #loaded = false;
  #entries: Record<string, StoredReviewEntry> = {};

  constructor(filePath: string = DEFAULT_STORE_PATH) {
    this.#filePath = filePath;
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    try {
      const raw = await readFile(this.#filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (isStoredMap(parsed)) {
        this.#entries = parsed;
      }
    } catch {
      this.#entries = {};
    }
    this.#loaded = true;
  }

  get(repo: string, number: number): PullRequestReviewState | null {
    const key = makeKey(repo, number);
    const entry = this.#entries[key];
    if (!entry) return null;
    return mapState(repo, number, entry);
  }

  async setFileSeen(params: {
    repo: string;
    number: number;
    headSha: string;
    filePath: string;
    fileSha: string | null;
    seen: boolean;
  }): Promise<PullRequestReviewState> {
    await this.load();

    const key = makeKey(params.repo, params.number);
    const now = new Date().toISOString();
    const entry = this.#entries[key] ?? {
      reviewedHeadSha: null,
      viewedFiles: {},
      updatedAt: now,
    };

    if (params.seen) {
      entry.viewedFiles[params.filePath] = {
        sha: params.fileSha,
        seenAt: now,
      };
      entry.reviewedHeadSha = params.headSha || entry.reviewedHeadSha;
    } else {
      delete entry.viewedFiles[params.filePath];
    }

    entry.updatedAt = now;
    this.#entries[key] = entry;
    await this.#save();

    return mapState(params.repo, params.number, entry);
  }

  async markFilesSeen(params: {
    repo: string;
    number: number;
    headSha: string;
    files: Array<{ path: string; sha: string | null }>;
  }): Promise<PullRequestReviewState> {
    await this.load();

    const key = makeKey(params.repo, params.number);
    const now = new Date().toISOString();
    const viewedFiles: Record<string, StoredFileState> = {};

    for (const file of params.files) {
      const path = String(file.path ?? "").trim();
      if (!path) continue;
      viewedFiles[path] = {
        sha: file.sha ?? null,
        seenAt: now,
      };
    }

    const entry: StoredReviewEntry = {
      reviewedHeadSha: params.headSha || null,
      viewedFiles,
      updatedAt: now,
    };

    this.#entries[key] = entry;
    await this.#save();

    return mapState(params.repo, params.number, entry);
  }

  async #save(): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(this.#entries, null, 2));
  }
}

function makeKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

function mapState(
  repo: string,
  number: number,
  entry: StoredReviewEntry
): PullRequestReviewState {
  return {
    repo,
    number,
    reviewedHeadSha: entry.reviewedHeadSha,
    viewedFiles: { ...entry.viewedFiles },
    updatedAt: entry.updatedAt,
  };
}

function isStoredMap(value: unknown): value is Record<string, StoredReviewEntry> {
  if (!value || typeof value !== "object") return false;
  const entries = Object.values(value as Record<string, unknown>);
  return entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    if (candidate.reviewedHeadSha !== null && typeof candidate.reviewedHeadSha !== "string") {
      return false;
    }
    if (!candidate.viewedFiles || typeof candidate.viewedFiles !== "object") {
      return false;
    }
    if (typeof candidate.updatedAt !== "string") {
      return false;
    }
    return true;
  });
}
