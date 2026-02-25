import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  PullRequestAgentReviewRun,
  PullRequestAgentReviewStatus,
} from "../shared/types.ts";
import {
  AGENT_REVIEW_BASE_DIR,
  buildAgentReviewFileName,
  buildAgentReviewFilePath,
  isAgentReviewPlaceholderPayload,
  isLegacyAgentReviewFileName,
  parseAgentReviewVersionFromFileName,
} from "./pr-agent-review-files.ts";

const DEFAULT_STORE_PATH = join(homedir(), ".claude-sessions", "pr-agent-reviews.json");

type StoredAgentReviewMap = Record<string, PullRequestAgentReviewRun[]>;

export class PRAgentReviewStore {
  #filePath: string;
  #baseDir: string;
  #loaded = false;
  #entries: StoredAgentReviewMap = {};

  constructor(
    filePath: string = DEFAULT_STORE_PATH,
    baseDir: string = AGENT_REVIEW_BASE_DIR
  ) {
    this.#filePath = filePath;
    this.#baseDir = baseDir;
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    try {
      const raw = await readFile(this.#filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (isStoredAgentReviewMap(parsed)) {
        this.#entries = parsed;
      }
    } catch {
      this.#entries = {};
    }
    const cleanedLegacy = await this.#cleanupLegacyArtifacts();
    this.#loaded = true;
    if (cleanedLegacy) {
      await this.#save();
    }
  }

  async listRuns(repo: string, number: number): Promise<PullRequestAgentReviewRun[]> {
    await this.load();
    const runs = this.#entries[makeKey(repo, number)] ?? [];
    return runs
      .slice()
      .sort((left, right) => left.version - right.version)
      .map(cloneRun);
  }

  async getRunByVersion(
    repo: string,
    number: number,
    version: number
  ): Promise<PullRequestAgentReviewRun | null> {
    await this.load();
    const runs = this.#entries[makeKey(repo, number)] ?? [];
    const match = runs.find((run) => run.version === Math.max(1, Math.trunc(version)));
    return match ? cloneRun(match) : null;
  }

  async getRunById(runId: string): Promise<PullRequestAgentReviewRun | null> {
    await this.load();
    const normalized = String(runId ?? "").trim();
    if (!normalized) return null;

    for (const runs of Object.values(this.#entries)) {
      const match = runs.find((run) => run.id === normalized);
      if (match) return cloneRun(match);
    }

    return null;
  }

  async getRunBySessionId(sessionId: string): Promise<PullRequestAgentReviewRun | null> {
    await this.load();
    const normalized = String(sessionId ?? "").trim();
    if (!normalized) return null;

    for (const runs of Object.values(this.#entries)) {
      const match = runs.find((run) => run.sessionId === normalized);
      if (match) return cloneRun(match);
    }

    return null;
  }

  async startRun(params: {
    repo: string;
    number: number;
    headSha: string;
  }): Promise<PullRequestAgentReviewRun> {
    await this.load();

    const repo = String(params.repo ?? "").trim();
    const number = Math.max(1, Math.trunc(params.number));
    const headSha = String(params.headSha ?? "").trim();
    if (!repo || !Number.isFinite(number)) {
      throw new Error("Invalid pull request selection");
    }

    await this.importExistingFiles(repo, number);

    const key = makeKey(repo, number);
    const runs = this.#entries[key] ?? [];
    if (runs.some((run) => run.status === "running")) {
      throw new Error("An Agent Review run is already active for this pull request");
    }

    const nextVersion = runs.reduce((maxVersion, run) => {
      if (!Number.isFinite(run.version)) return maxVersion;
      return Math.max(maxVersion, Math.max(1, Math.trunc(run.version)));
    }, 0) + 1;

    const now = new Date().toISOString();
    const run: PullRequestAgentReviewRun = {
      id: crypto.randomUUID(),
      repo,
      number,
      version: nextVersion,
      fileName: buildAgentReviewFileName(repo, number, nextVersion),
      filePath: buildAgentReviewFilePath(repo, number, nextVersion, this.#baseDir),
      headSha,
      status: "running",
      sessionId: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
    };

    runs.push(run);
    runs.sort((left, right) => left.version - right.version);
    this.#entries[key] = runs;
    await this.#save();

    return cloneRun(run);
  }

  async bindSessionId(
    runId: string,
    sessionId: string
  ): Promise<PullRequestAgentReviewRun | null> {
    return this.#updateRun(runId, (run) => {
      run.sessionId = String(sessionId ?? "").trim() || null;
      run.updatedAt = new Date().toISOString();
    });
  }

  async markCompleted(runId: string): Promise<PullRequestAgentReviewRun | null> {
    return this.#updateRun(runId, (run) => {
      run.status = "completed";
      run.error = null;
      run.sessionId = null;
      const now = new Date().toISOString();
      run.updatedAt = now;
      run.completedAt = now;
    });
  }

  async markFailed(
    runId: string,
    error: string,
    status: Extract<PullRequestAgentReviewStatus, "failed" | "stale"> = "failed"
  ): Promise<PullRequestAgentReviewRun | null> {
    return this.#updateRun(runId, (run) => {
      run.status = status;
      run.error = String(error ?? "Agent review failed").trim() || "Agent review failed";
      run.sessionId = null;
      run.updatedAt = new Date().toISOString();
      if (status === "failed") {
        run.completedAt = null;
      }
    });
  }

  async reconcileInterruptedRuns(): Promise<PullRequestAgentReviewRun[]> {
    await this.load();

    const changedRuns: PullRequestAgentReviewRun[] = [];
    let dirty = false;

    for (const runs of Object.values(this.#entries)) {
      for (const run of runs) {
        if (run.status !== "running") continue;

        const rawDocument = await readFileOrNull(run.filePath);
        const hasPlaceholder = isPlaceholderDocument(rawDocument);
        const now = new Date().toISOString();

        if (!hasPlaceholder) {
          run.status = "completed";
          run.completedAt = run.completedAt ?? now;
          run.error = null;
        } else {
          run.status = "stale";
          run.completedAt = null;
          run.error = "Interrupted before completion";
        }

        run.sessionId = null;
        run.updatedAt = now;
        changedRuns.push(cloneRun(run));
        dirty = true;
      }
    }

    if (dirty) {
      await this.#save();
    }

    return changedRuns;
  }

  async importExistingFiles(
    repo: string,
    number: number
  ): Promise<PullRequestAgentReviewRun[]> {
    await this.load();

    const normalizedRepo = String(repo ?? "").trim();
    const normalizedNumber = Math.max(1, Math.trunc(number));
    if (!normalizedRepo || !Number.isFinite(normalizedNumber)) {
      return [];
    }

    const key = makeKey(normalizedRepo, normalizedNumber);
    const runs = this.#entries[key] ?? [];
    const existingVersions = new Set<number>();
    for (const run of runs) {
      const version = Math.max(1, Math.trunc(run.version));
      existingVersions.add(version);
    }

    const files = await readdir(this.#baseDir).catch(() => [] as string[]);
    if (files.length === 0) {
      this.#entries[key] = runs;
      return runs.slice().sort((left, right) => left.version - right.version).map(cloneRun);
    }

    let dirty = false;
    for (const fileName of files) {
      const version = parseAgentReviewVersionFromFileName(
        normalizedRepo,
        normalizedNumber,
        fileName
      );
      if (version == null) continue;
      if (existingVersions.has(version)) continue;

      const filePath = join(this.#baseDir, fileName);
      const [fileStats, rawDocument] = await Promise.all([
        stat(filePath).catch(() => null),
        readFileOrNull(filePath),
      ]);

      const timestamp = fileStats?.mtime?.toISOString() ?? new Date().toISOString();
      const hasPlaceholder = isPlaceholderDocument(rawDocument);

      runs.push({
        id: crypto.randomUUID(),
        repo: normalizedRepo,
        number: normalizedNumber,
        version,
        fileName,
        filePath,
        headSha: "",
        status: hasPlaceholder ? "stale" : "completed",
        sessionId: null,
        startedAt: timestamp,
        updatedAt: timestamp,
        completedAt: hasPlaceholder ? null : timestamp,
        error: hasPlaceholder ? "Interrupted before completion" : null,
      });
      existingVersions.add(version);
      dirty = true;
    }

    runs.sort((left, right) => left.version - right.version);
    this.#entries[key] = runs;

    if (dirty) {
      await this.#save();
    }

    return runs.map(cloneRun);
  }

  async #updateRun(
    runId: string,
    mutate: (run: PullRequestAgentReviewRun) => void
  ): Promise<PullRequestAgentReviewRun | null> {
    await this.load();

    const normalizedRunId = String(runId ?? "").trim();
    if (!normalizedRunId) return null;

    for (const [key, runs] of Object.entries(this.#entries)) {
      const index = runs.findIndex((run) => run.id === normalizedRunId);
      if (index < 0) continue;

      const run = runs[index];
      mutate(run);
      this.#entries[key] = runs;
      await this.#save();
      return cloneRun(run);
    }

    return null;
  }

  async #save(): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await mkdir(this.#baseDir, { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(this.#entries, null, 2));
  }

  async #cleanupLegacyArtifacts(): Promise<boolean> {
    let dirty = false;

    const nextEntries: StoredAgentReviewMap = {};
    for (const [key, runs] of Object.entries(this.#entries)) {
      const filteredRuns = runs.filter((run) => {
        const fileName = String(run.fileName ?? "").trim().toLowerCase();
        const filePath = String(run.filePath ?? "").trim().toLowerCase();
        const isLegacy = fileName.endsWith(".md") || filePath.endsWith(".md");
        if (isLegacy) {
          dirty = true;
        }
        return !isLegacy;
      });

      if (filteredRuns.length > 0) {
        nextEntries[key] = filteredRuns;
      } else if (runs.length > 0) {
        dirty = true;
      }
    }
    this.#entries = nextEntries;

    const files = await readdir(this.#baseDir).catch(() => [] as string[]);
    for (const fileName of files) {
      if (!isLegacyAgentReviewFileName(fileName)) continue;
      const filePath = join(this.#baseDir, fileName);
      await unlink(filePath).catch(() => {});
      dirty = true;
    }

    return dirty;
  }
}

function makeKey(repo: string, number: number): string {
  return `${String(repo ?? "").trim()}#${Math.max(1, Math.trunc(number))}`;
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function isPlaceholderDocument(rawDocument: string | null): boolean {
  if (!rawDocument) return true;
  try {
    const parsed = JSON.parse(rawDocument);
    return isAgentReviewPlaceholderPayload(parsed);
  } catch {
    return true;
  }
}

function cloneRun(run: PullRequestAgentReviewRun): PullRequestAgentReviewRun {
  return {
    ...run,
    repo: String(run.repo ?? "").trim(),
    number: Math.max(1, Math.trunc(run.number)),
    version: Math.max(1, Math.trunc(run.version)),
    headSha: String(run.headSha ?? ""),
    sessionId: run.sessionId ? String(run.sessionId) : null,
    status: normalizeStatus(run.status),
    fileName: String(run.fileName ?? ""),
    filePath: String(run.filePath ?? ""),
    startedAt: String(run.startedAt ?? ""),
    updatedAt: String(run.updatedAt ?? ""),
    completedAt: run.completedAt ? String(run.completedAt) : null,
    error: run.error ? String(run.error) : null,
  };
}

function normalizeStatus(value: unknown): PullRequestAgentReviewStatus {
  const status = String(value ?? "").toLowerCase();
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "stale") return "stale";
  return "failed";
}

function isStoredAgentReviewMap(value: unknown): value is StoredAgentReviewMap {
  if (!value || typeof value !== "object") return false;

  const entries = Object.values(value as Record<string, unknown>);
  return entries.every((entry) => {
    if (!Array.isArray(entry)) return false;
    return entry.every(isStoredRun);
  });
}

function isStoredRun(value: unknown): value is PullRequestAgentReviewRun {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string"
    && typeof candidate.repo === "string"
    && typeof candidate.number === "number"
    && typeof candidate.version === "number"
    && typeof candidate.fileName === "string"
    && typeof candidate.filePath === "string"
    && typeof candidate.headSha === "string"
    && typeof candidate.startedAt === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.sessionId === null || typeof candidate.sessionId === "string")
    && (candidate.completedAt === null || typeof candidate.completedAt === "string")
    && (candidate.error === null || typeof candidate.error === "string")
  );
}
