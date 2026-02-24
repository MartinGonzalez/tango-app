import { parseDiff } from "../mainview/components/diff-parser.ts";
import type {
  DiffFile,
  PullRequestCheck,
  PullRequestCommit,
  PullRequestConversationItem,
  PullRequestDetail,
  PullRequestFileMeta,
  PullRequestReviewThread,
  PullRequestReviewThreadComment,
  PullRequestSummary,
} from "../shared/types.ts";

export type GhErrorCode = "gh_missing" | "auth_failed" | "api_error";

export class GhCommandError extends Error {
  code: GhErrorCode;
  args: string[];
  stderr: string;
  exitCode: number;

  constructor(params: {
    code: GhErrorCode;
    message: string;
    args: string[];
    stderr: string;
    exitCode: number;
  }) {
    super(params.message);
    this.name = "GhCommandError";
    this.code = params.code;
    this.args = params.args;
    this.stderr = params.stderr;
    this.exitCode = params.exitCode;
  }
}

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type CommandRunner = (args: string[]) => Promise<CommandResult>;

export class PullRequestProvider {
  #run: CommandRunner;

  constructor(run: CommandRunner = runGhCommand) {
    this.#run = run;
  }

  async getAssignedPullRequests(limit = 60): Promise<PullRequestSummary[]> {
    return this.#searchPullRequests({
      filterFlag: "--assignee",
      filterValue: "@me",
      limit,
    });
  }

  async getOpenedPullRequests(limit = 60): Promise<PullRequestSummary[]> {
    return this.#searchPullRequests({
      filterFlag: "--author",
      filterValue: "@me",
      limit,
    });
  }

  async #searchPullRequests(params: {
    filterFlag: "--assignee" | "--author";
    filterValue: string;
    limit: number;
  }): Promise<PullRequestSummary[]> {
    const safeLimit = Number.isFinite(params.limit)
      ? Math.max(1, Math.min(200, Math.floor(params.limit)))
      : 60;

    const raw = await runGhJson<any[]>(this.#run, [
      "search",
      "prs",
      params.filterFlag,
      params.filterValue,
      "--state",
      "open",
      "-L",
      String(safeLimit),
      "--json",
      "number,title,repository,author,isDraft,updatedAt,url",
    ]);

    const rows = Array.isArray(raw) ? raw : [];
    const out: PullRequestSummary[] = [];

    for (const entry of rows) {
      const repo = String(entry?.repository?.nameWithOwner ?? "").trim();
      const number = toInteger(entry?.number);
      if (!repo || number <= 0) continue;

      out.push({
        repo,
        number,
        title: String(entry?.title ?? "(untitled PR)").trim() || "(untitled PR)",
        authorLogin: String(entry?.author?.login ?? "unknown").trim() || "unknown",
        authorIsBot: Boolean(
          entry?.author?.is_bot
            ?? entry?.author?.isBot
            ?? String(entry?.author?.type ?? "").toLowerCase() === "bot"
        ),
        isDraft: Boolean(entry?.isDraft),
        updatedAt: normalizeIso(String(entry?.updatedAt ?? "")),
        url: String(entry?.url ?? "").trim(),
      });
    }

    out.sort((a, b) => {
      const tsA = Date.parse(a.updatedAt);
      const tsB = Date.parse(b.updatedAt);
      if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsA !== tsB) {
        return tsB - tsA;
      }
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return a.number - b.number;
    });

    return out;
  }

  async getPullRequestDetail(repo: string, number: number): Promise<PullRequestDetail> {
    const pr = await runGhJson<any>(this.#run, [
      "pr",
      "view",
      String(number),
      "-R",
      repo,
      "--json",
      "number,title,body,url,state,isDraft,author,baseRefName,headRefName,headRefOid,reviewDecision,mergeStateStatus,createdAt,updatedAt,commits,statusCheckRollup",
    ]);

    const warnings: string[] = [];

    const [files, issueComments, reviews, reviewComments] = await Promise.all([
      this.#loadOptionalPagedArray<any>(
        ["api", `repos/${repo}/pulls/${number}/files`],
        "PR files",
        warnings
      ),
      this.#loadOptionalPagedArray<any>(
        ["api", `repos/${repo}/issues/${number}/comments`],
        "issue comments",
        warnings
      ),
      this.#loadOptionalPagedArray<any>(
        ["api", `repos/${repo}/pulls/${number}/reviews`],
        "reviews",
        warnings
      ),
      this.#loadOptionalPagedArray<any>(
        ["api", `repos/${repo}/pulls/${number}/comments`],
        "review comments",
        warnings
      ),
    ]);

    const commits = normalizePullRequestCommits(pr?.commits);
    const mappedFiles = normalizePullRequestFiles(files);

    return {
      repo,
      number,
      title: String(pr?.title ?? "(untitled PR)").trim() || "(untitled PR)",
      body: String(pr?.body ?? ""),
      url: String(pr?.url ?? "").trim(),
      state: String(pr?.state ?? "OPEN"),
      isDraft: Boolean(pr?.isDraft),
      authorLogin: String(pr?.author?.login ?? "unknown").trim() || "unknown",
      authorName: String(pr?.author?.name ?? "").trim(),
      authorIsBot: Boolean(pr?.author?.is_bot ?? pr?.author?.isBot),
      baseRefName: String(pr?.baseRefName ?? "").trim(),
      headRefName: String(pr?.headRefName ?? "").trim(),
      headSha: String(pr?.headRefOid ?? "").trim(),
      reviewDecision: asNullableString(pr?.reviewDecision),
      mergeStateStatus: asNullableString(pr?.mergeStateStatus),
      createdAt: normalizeIso(String(pr?.createdAt ?? "")),
      updatedAt: normalizeIso(String(pr?.updatedAt ?? "")),
      checks: normalizePullRequestChecks(pr?.statusCheckRollup),
      commits,
      files: mappedFiles,
      conversation: buildPullRequestConversation(issueComments, reviews, reviewComments),
      warnings,
    };
  }

  async getPullRequestDiff(
    repo: string,
    number: number,
    commitSha?: string | null
  ): Promise<DiffFile[]> {
    const endpoint = commitSha
      ? `repos/${repo}/commits/${commitSha}`
      : `repos/${repo}/pulls/${number}`;

    const rawDiff = await runGhText(this.#run, [
      "api",
      endpoint,
      "-H",
      "Accept: application/vnd.github.v3.diff",
    ]);

    if (!rawDiff.trim()) return [];

    try {
      return parseDiff(rawDiff);
    } catch {
      return [];
    }
  }

  async replyPullRequestReviewComment(
    repo: string,
    number: number,
    commentId: string,
    body: string
  ): Promise<void> {
    const parsedCommentId = toInteger(commentId);
    const trimmedBody = String(body ?? "").trim();
    if (parsedCommentId <= 0) {
      throw new GhCommandError({
        code: "api_error",
        message: "Invalid pull request review comment id",
        args: [
          "api",
          `repos/${repo}/pulls/${number}/comments/${commentId}/replies`,
          "-X",
          "POST",
        ],
        stderr: "Invalid pull request review comment id",
        exitCode: 1,
      });
    }
    if (!trimmedBody) {
      throw new GhCommandError({
        code: "api_error",
        message: "Reply body cannot be empty",
        args: [
          "api",
          `repos/${repo}/pulls/${number}/comments/${parsedCommentId}/replies`,
          "-X",
          "POST",
        ],
        stderr: "Reply body cannot be empty",
        exitCode: 1,
      });
    }

    await runGhText(this.#run, [
      "api",
      `repos/${repo}/pulls/${number}/comments/${parsedCommentId}/replies`,
      "-X",
      "POST",
      "-f",
      `body=${trimmedBody}`,
    ]);
  }

  async #loadOptionalPagedArray<T>(
    args: string[],
    label: string,
    warnings: string[]
  ): Promise<T[]> {
    try {
      return await runGhPagedJson<T>(this.#run, args);
    } catch (error) {
      const err = toGhCommandError(error, args);
      if (err.code === "gh_missing" || err.code === "auth_failed") {
        throw err;
      }
      warnings.push(`Failed to load ${label}: ${shortError(err)}`);
      return [];
    }
  }
}

export const pullRequestProvider = new PullRequestProvider();

export async function getAssignedPullRequests(limit?: number): Promise<PullRequestSummary[]> {
  return pullRequestProvider.getAssignedPullRequests(limit);
}

export async function getOpenedPullRequests(limit?: number): Promise<PullRequestSummary[]> {
  return pullRequestProvider.getOpenedPullRequests(limit);
}

export async function getPullRequestDetail(
  repo: string,
  number: number
): Promise<PullRequestDetail> {
  return pullRequestProvider.getPullRequestDetail(repo, number);
}

export async function getPullRequestDiff(
  repo: string,
  number: number,
  commitSha?: string | null
): Promise<DiffFile[]> {
  return pullRequestProvider.getPullRequestDiff(repo, number, commitSha);
}

export async function replyPullRequestReviewComment(
  repo: string,
  number: number,
  commentId: string,
  body: string
): Promise<void> {
  return pullRequestProvider.replyPullRequestReviewComment(repo, number, commentId, body);
}

export function normalizePullRequestChecks(input: unknown): PullRequestCheck[] {
  if (!Array.isArray(input)) return [];

  const checks: PullRequestCheck[] = [];
  for (let i = 0; i < input.length; i++) {
    const item = input[i] as Record<string, unknown>;
    const typename = String(item?.__typename ?? "").trim();

    if (typename === "CheckRun") {
      const name = String(item?.name ?? "Check run").trim() || "Check run";
      checks.push({
        id: `check_run:${name}:${i}`,
        type: "check_run",
        name,
        workflowName: asNullableString(item?.workflowName),
        status: String(item?.status ?? "UNKNOWN").toUpperCase(),
        conclusion: asNullableString(item?.conclusion)?.toUpperCase() ?? null,
        url: asNullableString(item?.detailsUrl),
        startedAt: asNullableString(item?.startedAt),
        completedAt: asNullableString(item?.completedAt),
      });
      continue;
    }

    if (typename === "StatusContext") {
      const state = String(item?.state ?? "PENDING").toUpperCase();
      checks.push({
        id: `status_context:${String(item?.context ?? "status")}:${i}`,
        type: "status_context",
        name: String(item?.context ?? "Status").trim() || "Status",
        workflowName: null,
        status: state === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
        conclusion: mapStatusContextStateToConclusion(state),
        url: asNullableString(item?.targetUrl),
        startedAt: null,
        completedAt: null,
      });
      continue;
    }

    const name = String(item?.name ?? item?.context ?? "Check").trim() || "Check";
    checks.push({
      id: `other:${name}:${i}`,
      type: "other",
      name,
      workflowName: null,
      status: String(item?.status ?? item?.state ?? "UNKNOWN").toUpperCase(),
      conclusion: asNullableString(item?.conclusion),
      url: asNullableString(item?.detailsUrl ?? item?.targetUrl),
      startedAt: asNullableString(item?.startedAt),
      completedAt: asNullableString(item?.completedAt),
    });
  }

  return checks;
}

export function buildPullRequestConversation(
  issueCommentsInput: unknown,
  reviewsInput: unknown,
  reviewCommentsInput: unknown
): PullRequestConversationItem[] {
  const issueComments = Array.isArray(issueCommentsInput)
    ? issueCommentsInput as Array<Record<string, unknown>>
    : [];
  const reviews = Array.isArray(reviewsInput)
    ? reviewsInput as Array<Record<string, unknown>>
    : [];
  const reviewComments = Array.isArray(reviewCommentsInput)
    ? reviewCommentsInput as Array<Record<string, unknown>>
    : [];

  const issueItems: PullRequestConversationItem[] = issueComments.map((comment) => ({
    kind: "issue_comment",
    id: String(comment?.id ?? ""),
    authorLogin: String((comment?.user as any)?.login ?? "unknown"),
    authorAssociation: asNullableString(comment?.author_association),
    body: String(comment?.body ?? ""),
    createdAt: normalizeIso(String(comment?.created_at ?? "")),
    updatedAt: normalizeIso(String(comment?.updated_at ?? comment?.created_at ?? "")),
    url: asNullableString(comment?.html_url),
  }));

  const reviewItems: PullRequestConversationItem[] = reviews.map((review) => {
    const submittedAt = asNullableString(review?.submitted_at);
    const createdAt = normalizeIso(
      submittedAt ?? String(review?.submitted_at ?? review?.submittedAt ?? "")
    );
    return {
      kind: "review",
      id: String(review?.id ?? ""),
      authorLogin: String((review?.user as any)?.login ?? "unknown"),
      authorAssociation: asNullableString(review?.author_association),
      state: String(review?.state ?? "COMMENTED"),
      body: String(review?.body ?? ""),
      commitSha: asNullableString(review?.commit_id),
      createdAt,
      submittedAt,
    };
  });

  const threadItems = buildReviewThreads(reviewComments);

  const items = [...issueItems, ...reviewItems, ...threadItems];
  items.sort((a, b) => {
    const tsA = Date.parse(a.createdAt);
    const tsB = Date.parse(b.createdAt);
    if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsA !== tsB) {
      return tsA - tsB;
    }
    return a.id.localeCompare(b.id);
  });
  return items;
}

function buildReviewThreads(
  input: Array<Record<string, unknown>>
): PullRequestReviewThread[] {
  const commentsById = new Map<number, Record<string, unknown>>();
  for (const comment of input) {
    const id = toInteger(comment?.id);
    if (id > 0) {
      commentsById.set(id, comment);
    }
  }

  const rootCache = new Map<number, number>();
  const resolveRootId = (id: number): number => {
    if (rootCache.has(id)) return rootCache.get(id)!;
    let current = id;
    const seen = new Set<number>();

    while (true) {
      if (seen.has(current)) break;
      seen.add(current);

      const comment = commentsById.get(current);
      if (!comment) break;
      const parentId = toInteger(comment?.in_reply_to_id);
      if (parentId <= 0 || !commentsById.has(parentId)) break;
      current = parentId;
    }

    rootCache.set(id, current);
    return current;
  };

  const grouped = new Map<number, PullRequestReviewThreadComment[]>();
  for (const comment of input) {
    const id = toInteger(comment?.id);
    if (id <= 0) continue;
    const rootId = resolveRootId(id);

    const mapped: PullRequestReviewThreadComment = {
      id: String(id),
      authorLogin: String((comment?.user as any)?.login ?? "unknown"),
      authorAssociation: asNullableString(comment?.author_association),
      body: String(comment?.body ?? ""),
      path: String(comment?.path ?? ""),
      line: asNullableInteger(comment?.line),
      originalLine: asNullableInteger(comment?.original_line),
      side: asNullableString(comment?.side),
      commitSha: asNullableString(comment?.commit_id),
      createdAt: normalizeIso(String(comment?.created_at ?? "")),
      updatedAt: normalizeIso(String(comment?.updated_at ?? comment?.created_at ?? "")),
      inReplyToId: asNullableString(comment?.in_reply_to_id),
    };

    const list = grouped.get(rootId) ?? [];
    list.push(mapped);
    grouped.set(rootId, list);
  }

  const threads: PullRequestReviewThread[] = [];
  for (const [rootId, comments] of grouped) {
    if (comments.length === 0) continue;
    comments.sort((a, b) => {
      const tsA = Date.parse(a.createdAt);
      const tsB = Date.parse(b.createdAt);
      if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsA !== tsB) {
        return tsA - tsB;
      }
      return a.id.localeCompare(b.id);
    });

    const root = comments[0];
    threads.push({
      kind: "review_thread",
      id: `thread-${rootId}`,
      path: root.path,
      line: root.line,
      originalLine: root.originalLine,
      side: root.side,
      isResolved: null,
      createdAt: root.createdAt,
      updatedAt: comments[comments.length - 1].updatedAt,
      comments,
    });
  }

  return threads;
}

function normalizePullRequestCommits(input: unknown): PullRequestCommit[] {
  if (!Array.isArray(input)) return [];

  return input.map((entry) => {
    const item = entry as Record<string, unknown>;
    const authors = Array.isArray(item?.authors)
      ? item.authors as Array<Record<string, unknown>>
      : [];
    const firstAuthor = authors[0] ?? {};
    const sha = String(item?.oid ?? "").trim();

    return {
      sha,
      shortSha: sha.slice(0, 7),
      messageHeadline: String(item?.messageHeadline ?? "(no subject)").trim() || "(no subject)",
      messageBody: String(item?.messageBody ?? ""),
      authoredDate: normalizeIso(String(item?.authoredDate ?? "")),
      committedDate: normalizeIso(String(item?.committedDate ?? "")),
      authorLogin: String(firstAuthor?.login ?? "").trim(),
      authorName: String(firstAuthor?.name ?? "").trim(),
    };
  }).filter((entry) => entry.sha.length > 0);
}

function normalizePullRequestFiles(input: unknown): PullRequestFileMeta[] {
  if (!Array.isArray(input)) return [];

  const files: PullRequestFileMeta[] = [];
  for (const entry of input) {
    const item = entry as Record<string, unknown>;
    const path = String(item?.filename ?? "").trim();
    if (!path) continue;

    files.push({
      path,
      previousPath: asNullableString(item?.previous_filename),
      status: normalizeFileStatus(item?.status),
      additions: Math.max(0, toInteger(item?.additions)),
      deletions: Math.max(0, toInteger(item?.deletions)),
      sha: asNullableString(item?.sha),
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function normalizeFileStatus(value: unknown): DiffFile["status"] {
  const status = String(value ?? "").toLowerCase();
  if (status === "added") return "added";
  if (status === "removed") return "deleted";
  if (status === "deleted") return "deleted";
  if (status === "renamed") return "renamed";
  return "modified";
}

function mapStatusContextStateToConclusion(state: string): string | null {
  if (state === "SUCCESS") return "SUCCESS";
  if (state === "FAILURE") return "FAILURE";
  if (state === "ERROR") return "FAILURE";
  if (state === "PENDING") return null;
  return state;
}

async function runGhPagedJson<T>(run: CommandRunner, args: string[]): Promise<T[]> {
  const pages = await runGhJson<unknown>(run, [...args, "--paginate", "--slurp"]);
  if (!Array.isArray(pages)) return [];

  const out: T[] = [];
  for (const page of pages) {
    if (Array.isArray(page)) {
      out.push(...(page as T[]));
      continue;
    }
    if (page != null) {
      out.push(page as T);
    }
  }

  return out;
}

async function runGhJson<T>(run: CommandRunner, args: string[]): Promise<T> {
  const stdout = await runGhText(run, args);
  if (!stdout.trim()) {
    return [] as unknown as T;
  }

  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new GhCommandError({
      code: "api_error",
      message: `Invalid JSON returned by gh (${formatArgs(args)})`,
      args,
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 0,
    });
  }
}

async function runGhText(run: CommandRunner, args: string[]): Promise<string> {
  const result = await run(args);
  if (result.exitCode === 0) {
    return result.stdout;
  }

  throw new GhCommandError({
    code: classifyGhFailure(result.stderr),
    message: `gh command failed (${formatArgs(args)})`,
    args,
    stderr: result.stderr,
    exitCode: result.exitCode,
  });
}

export function classifyGhFailure(stderr: string): GhErrorCode {
  const normalized = String(stderr ?? "").toLowerCase();

  if (
    normalized.includes("not logged in")
    || normalized.includes("gh auth login")
    || normalized.includes("authentication failed")
    || normalized.includes("requires authentication")
    || normalized.includes("http 401")
    || normalized.includes("bad credentials")
  ) {
    return "auth_failed";
  }

  if (
    normalized.includes("command not found")
    || normalized.includes("no such file or directory")
    || normalized.includes("executable file not found")
  ) {
    return "gh_missing";
  }

  return "api_error";
}

async function runGhCommand(args: string[]): Promise<CommandResult> {
  try {
    const proc = Bun.spawn(["gh", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      stdout,
      stderr,
      exitCode,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new GhCommandError({
        code: "gh_missing",
        message: "gh executable is not available",
        args,
        stderr: error.message,
        exitCode: 127,
      });
    }

    throw error;
  }
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : 0;
}

function asNullableInteger(value: unknown): number | null {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  return Math.trunc(next);
}

function asNullableString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeIso(value: string): string {
  const text = String(value ?? "").trim();
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) {
    return new Date(0).toISOString();
  }
  return new Date(ts).toISOString();
}

function formatArgs(args: string[]): string {
  return ["gh", ...args].join(" ");
}

function shortError(error: GhCommandError): string {
  const stderr = String(error.stderr ?? "").trim();
  if (!stderr) return error.code;
  const firstLine = stderr.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return error.code;
  return firstLine;
}

function toGhCommandError(error: unknown, args: string[]): GhCommandError {
  if (error instanceof GhCommandError) return error;
  return new GhCommandError({
    code: "api_error",
    message: `gh command failed (${formatArgs(args)})`,
    args,
    stderr: error instanceof Error ? error.message : String(error),
    exitCode: 1,
  });
}
