import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  PullRequestAgentReviewData,
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewLevel,
  PullRequestAgentReviewRun,
  PullRequestAgentReviewSuggestion,
} from "../shared/types.ts";
import {
  AGENT_REVIEW_BASE_DIR,
  AGENT_REVIEW_PLACEHOLDER_KEY,
  AGENT_REVIEW_PLACEHOLDER_TEXT,
  isAgentReviewPlaceholderPayload,
} from "./pr-agent-review-files.ts";

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<CommandResult>;

type CwdSource = "workspace" | "home";

export type AgentReviewCwdResolution = {
  cwd: string;
  source: CwdSource;
  workspacePath: string | null;
};

const ALLOWED_REVIEW_LEVELS = new Set<PullRequestAgentReviewLevel>([
  "Low",
  "Medium",
  "Important",
  "Critical",
]);

export class PRAgentReviewProvider {
  #baseDir: string;
  #homeDir: string;
  #getWorkspacePaths: () => string[];
  #runCommand: CommandRunner;

  constructor(options?: {
    baseDir?: string;
    homeDir?: string;
    getWorkspacePaths?: () => string[];
    runCommand?: CommandRunner;
  }) {
    this.#baseDir = options?.baseDir ?? AGENT_REVIEW_BASE_DIR;
    this.#homeDir = options?.homeDir ?? homedir();
    this.#getWorkspacePaths = options?.getWorkspacePaths ?? (() => []);
    this.#runCommand = options?.runCommand ?? runCommand;
  }

  async writePlaceholder(run: PullRequestAgentReviewRun): Promise<void> {
    const payload: Record<string, unknown> = {
      [AGENT_REVIEW_PLACEHOLDER_KEY]: true,
      metadata: buildBaseMetadata(run),
      pr_summary: "",
      strengths: "",
      improvements: "",
      suggestions: [],
      final_veredic: AGENT_REVIEW_PLACEHOLDER_TEXT,
    };
    await this.#writeJson(run.filePath, payload);
  }

  async writeFailedDocument(run: PullRequestAgentReviewRun, error: string): Promise<void> {
    const message = String(error ?? "Agent review failed").trim() || "Agent review failed";
    const payload: PullRequestAgentReviewData = {
      metadata: buildBaseMetadata(run),
      pr_summary: "",
      strengths: "",
      improvements: "",
      suggestions: [],
      final_veredic: `Agent review failed: ${message}`,
    };
    await this.#writeJson(run.filePath, payload);
  }

  async ensureCompletedDocument(run: PullRequestAgentReviewRun, resultText: string): Promise<void> {
    const rawFile = await readFileOrNull(run.filePath);
    const parsedFile = parseAgentReviewFromRaw(rawFile);
    if (parsedFile.review && !parsedFile.isPlaceholder) {
      await this.#writeJson(run.filePath, parsedFile.review);
      return;
    }

    const fallbackRaw = extractJsonCandidateFromText(resultText);
    const parsedFallback = parseAgentReviewFromRaw(fallbackRaw);
    if (parsedFallback.review && !parsedFallback.isPlaceholder) {
      await this.#writeJson(run.filePath, parsedFallback.review);
      return;
    }

    const errorParts = [
      parsedFile.parseError ? `file: ${parsedFile.parseError}` : null,
      parsedFallback.parseError ? `result: ${parsedFallback.parseError}` : null,
    ].filter(Boolean);
    throw new Error(
      errorParts.length > 0
        ? `Invalid agent review JSON (${errorParts.join("; ")})`
        : "Agent review did not produce valid JSON"
    );
  }

  async getDocument(run: PullRequestAgentReviewRun): Promise<PullRequestAgentReviewDocument | null> {
    const rawJson = await readFileOrNull(run.filePath);
    if (rawJson == null) return null;

    const parsed = parseAgentReviewFromRaw(rawJson);
    const renderedMarkdown = parsed.review
      ? renderAgentReviewMarkdown(parsed.review)
      : renderInvalidAgentReviewMarkdown(parsed.parseError);

    return {
      run,
      rawJson,
      review: parsed.review,
      renderedMarkdown,
      parseError: parsed.parseError,
    };
  }

  async markSuggestionApplied(
    run: PullRequestAgentReviewRun,
    suggestionIndex: number,
    applied: boolean
  ): Promise<PullRequestAgentReviewData> {
    const rawJson = await readFileOrNull(run.filePath);
    const parsed = parseAgentReviewFromRaw(rawJson);
    if (!parsed.review) {
      throw new Error(parsed.parseError ?? "Review JSON is missing");
    }
    if (parsed.isPlaceholder) {
      throw new Error("Review is still generating");
    }

    const normalizedIndex = Math.trunc(suggestionIndex);
    if (normalizedIndex < 0 || normalizedIndex >= parsed.review.suggestions.length) {
      throw new Error("Suggestion index is out of range");
    }

    const nextReview: PullRequestAgentReviewData = {
      ...parsed.review,
      metadata: { ...parsed.review.metadata },
      suggestions: parsed.review.suggestions.map((item, index) => {
        if (index !== normalizedIndex) return { ...item };
        return {
          ...item,
          applied: Boolean(applied),
        };
      }),
    };

    await this.#writeJson(run.filePath, nextReview);
    return nextReview;
  }

  async resolveCwd(repo: string): Promise<AgentReviewCwdResolution> {
    const normalizedRepo = normalizeRepoKey(repo);
    const workspaces = this.#getWorkspacePaths()
      .map((path) => String(path ?? "").trim())
      .filter(Boolean);

    for (const workspacePath of workspaces) {
      const remoteRepo = await this.#resolveWorkspaceRepo(workspacePath);
      if (!remoteRepo) continue;
      if (normalizeRepoKey(remoteRepo) === normalizedRepo) {
        return {
          cwd: workspacePath,
          source: "workspace",
          workspacePath,
        };
      }
    }

    return {
      cwd: this.#homeDir,
      source: "home",
      workspacePath: null,
    };
  }

  buildPrompt(params: {
    repo: string;
    number: number;
    headSha: string;
    outputFilePath: string;
    cwdSource: CwdSource;
    workspacePath?: string | null;
  }): string {
    return buildAgentReviewPrompt(params);
  }

  async #resolveWorkspaceRepo(workspacePath: string): Promise<string | null> {
    const commandResult = await this.#runCommand(
      "git",
      ["config", "--get", "remote.origin.url"],
      workspacePath
    );

    if (commandResult.exitCode !== 0) {
      return null;
    }

    return parseRepoFromRemoteUrl(commandResult.stdout);
  }

  async #writeJson(filePath: string, payload: unknown): Promise<void> {
    await mkdir(this.#baseDir, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

export function buildAgentReviewPrompt(params: {
  repo: string;
  number: number;
  headSha: string;
  outputFilePath: string;
  cwdSource: CwdSource;
  workspacePath?: string | null;
}): string {
  const repo = String(params.repo ?? "").trim();
  const number = Math.max(1, Math.trunc(params.number));
  const headSha = String(params.headSha ?? "").trim();
  const outputFilePath = String(params.outputFilePath ?? "").trim();
  const cwdSource = params.cwdSource === "workspace" ? "workspace" : "home";
  const workspacePath = String(params.workspacePath ?? "").trim();

  return [
    "Run a comprehensive pull request review and produce STRICT JSON output.",
    "Do not use markdown output as the final artifact.",
    "",
    `Repository: ${repo}`,
    `Pull Request: #${number}`,
    `Head SHA: ${headSha || "(unknown)"}`,
    `Output JSON file (overwrite this exact file): ${outputFilePath}`,
    "",
    "Review workflow guidance:",
    "1. Fetch PR data with GitHub CLI (`gh pr view`, `gh api`, `gh pr diff`) and repository context.",
    "2. Focus on concrete engineering feedback: correctness, risks, tests, maintainability, and rollout impact.",
    "3. Keep summaries concise and specific.",
    "",
    "Required output schema (top-level JSON object):",
    "{",
    '  "metadata": {',
    '    "repository": "<owner/repo>",',
    '    "pr_number": "<number as string>",',
    '    "author": "<pr author>",',
    '    "base_branch": "<target branch>",',
    '    "head_branch": "<feature branch>",',
    '    "head_sha": "<head sha>"',
    "  },",
    '  "pr_summary": "<5-10 lines max>",',
    '  "strengths": "<5-10 lines max>",',
    '  "improvements": "<5-10 lines max>",',
    '  "suggestions": [',
    "    {",
    '      "level": "Low | Medium | Important | Critical",',
    '      "content": "<markdown details for one suggestion>",',
    '      "applied": false',
    "    }",
    "  ],",
    '  "final_veredic": "<critical recommendation, what can be deferred, and whether to create a Jira ticket>"',
    "}",
    "",
    "Hard constraints:",
    "- Write valid JSON only to the output file (no comments, no trailing commas).",
    "- Include all required keys exactly as specified.",
    "- `suggestions[].applied` must always be `false` in generated reviews.",
    "- If no suggestions, return an empty array.",
    "- Use GitHub CLI with `-R <owner/repo>` when not in the repository directory.",
    "",
    cwdSource === "workspace"
      ? `Execution context: local workspace available at ${workspacePath}`
      : "Execution context: no local workspace match found; use gh with -R for repository-scoped commands.",
  ].join("\n");
}

export function parseRepoFromRemoteUrl(value: string): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const withoutProtocol = normalized.replace(/^ssh:\/\//i, "");
  const match = withoutProtocol.match(/github\.com[:/]([^\s]+)$/i);
  if (!match) return null;

  const candidate = match[1]
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  const parts = candidate.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  return `${parts[0]}/${parts[1]}`;
}

type ParsedAgentReviewDocument = {
  review: PullRequestAgentReviewData | null;
  parseError: string | null;
  isPlaceholder: boolean;
};

export function parseAgentReviewFromRaw(rawJson: string | null | undefined): ParsedAgentReviewDocument {
  if (rawJson == null) {
    return {
      review: null,
      parseError: "Review file not found",
      isPlaceholder: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      review: null,
      parseError: `Invalid JSON: ${message}`,
      isPlaceholder: false,
    };
  }

  const normalized = normalizeAgentReviewData(parsed);
  if (!normalized.review) {
    return {
      review: null,
      parseError: normalized.parseError,
      isPlaceholder: isAgentReviewPlaceholderPayload(parsed),
    };
  }

  return {
    review: normalized.review,
    parseError: null,
    isPlaceholder: isAgentReviewPlaceholderPayload(parsed),
  };
}

function normalizeAgentReviewData(input: unknown): {
  review: PullRequestAgentReviewData | null;
  parseError: string | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      review: null,
      parseError: "Top-level review document must be a JSON object",
    };
  }

  const src = input as Record<string, unknown>;
  const metadata = normalizeMetadata(src.metadata);
  if (!metadata) {
    return {
      review: null,
      parseError: "Field `metadata` must be an object of string values",
    };
  }

  const prSummary = asStringOrNull(src.pr_summary);
  const strengths = asStringOrNull(src.strengths);
  const improvements = asStringOrNull(src.improvements);
  const finalVeredic = asStringOrNull(src.final_veredic);
  if (prSummary == null || strengths == null || improvements == null || finalVeredic == null) {
    return {
      review: null,
      parseError: "Fields `pr_summary`, `strengths`, `improvements`, and `final_veredic` must be strings",
    };
  }

  if (!Array.isArray(src.suggestions)) {
    return {
      review: null,
      parseError: "Field `suggestions` must be an array",
    };
  }

  const suggestions: PullRequestAgentReviewSuggestion[] = [];
  for (let i = 0; i < src.suggestions.length; i++) {
    const suggestion = normalizeSuggestion(src.suggestions[i]);
    if (!suggestion) {
      return {
        review: null,
        parseError: `Invalid suggestion at index ${i}`,
      };
    }
    suggestions.push(suggestion);
  }

  return {
    review: {
      metadata,
      pr_summary: prSummary,
      strengths,
      improvements,
      suggestions,
      final_veredic: finalVeredic,
    },
    parseError: null,
  };
}

function normalizeMetadata(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      return null;
    }
    out[String(key)] = value;
  }
  return out;
}

function normalizeSuggestion(input: unknown): PullRequestAgentReviewSuggestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const src = input as Record<string, unknown>;
  const level = asStringOrNull(src.level);
  const content = asStringOrNull(src.content);
  if (!level || !content) return null;
  if (!ALLOWED_REVIEW_LEVELS.has(level as PullRequestAgentReviewLevel)) {
    return null;
  }
  if (typeof src.applied !== "boolean") return null;

  return {
    level: level as PullRequestAgentReviewLevel,
    content,
    applied: src.applied,
  };
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function buildBaseMetadata(run: PullRequestAgentReviewRun): Record<string, string> {
  return {
    repository: run.repo,
    pr_number: String(run.number),
    version: `v${run.version}`,
    head_sha: run.headSha || "(unknown)",
    started_at: run.startedAt,
  };
}

export function renderAgentReviewMarkdown(review: PullRequestAgentReviewData): string {
  const lines: string[] = [];
  lines.push("# Agent Review");
  lines.push("");

  const entries = Object.entries(review.metadata ?? {});
  if (entries.length > 0) {
    lines.push("## Metadata");
    lines.push("");
    for (const [key, value] of entries) {
      const label = key.replace(/_/g, " ");
      lines.push(`- **${label}:** ${value}`);
    }
    lines.push("");
  }

  lines.push("## PR Summary");
  lines.push("");
  lines.push(review.pr_summary || "_No summary provided._");
  lines.push("");

  lines.push("## Strengths");
  lines.push("");
  lines.push(review.strengths || "_No strengths provided._");
  lines.push("");

  lines.push("## Improvements");
  lines.push("");
  lines.push(review.improvements || "_No improvements provided._");
  lines.push("");

  lines.push("## Suggestions");
  lines.push("");
  if (review.suggestions.length === 0) {
    lines.push("_No suggestions._");
  } else {
    for (let i = 0; i < review.suggestions.length; i++) {
      const suggestion = review.suggestions[i];
      lines.push(`### ${i + 1}. ${suggestion.level}`);
      lines.push("");
      lines.push(suggestion.content || "_No content_");
      lines.push("");
      lines.push(`- Applied: ${suggestion.applied ? "Yes" : "No"}`);
      lines.push("");
    }
  }

  lines.push("## Final Veredic");
  lines.push("");
  lines.push(review.final_veredic || "_No final veredic provided._");
  lines.push("");

  return lines.join("\n").trim();
}

function renderInvalidAgentReviewMarkdown(parseError: string | null): string {
  return [
    "# Agent Review",
    "",
    "Unable to parse review JSON.",
    "",
    parseError ? `Error: \`${parseError.replace(/`/g, "'")}\`` : "",
  ].filter(Boolean).join("\n");
}

function extractJsonCandidateFromText(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (looksLikeParsableJson(raw)) {
    return raw;
  }

  const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  const fenced = fencedMatch?.[1]?.trim() ?? "";
  if (fenced && looksLikeParsableJson(fenced)) {
    return fenced;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    if (looksLikeParsableJson(candidate)) {
      return candidate;
    }
  }

  return null;
}

function looksLikeParsableJson(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

function normalizeRepoKey(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<CommandResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: cwd || undefined,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

export function getAgentReviewBaseDir(): string {
  return AGENT_REVIEW_BASE_DIR;
}

export function getAgentReviewStorePath(): string {
  return join(AGENT_REVIEW_BASE_DIR, "pr-agent-reviews.json");
}
