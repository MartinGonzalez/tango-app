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
      pr_description: "",
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
      pr_description: "",
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
    "Suggestion structure (mandatory for every `suggestions[]` item):",
    "- `title`: short and specific (max ~10 words).",
    "- `reason`: 2-3 short lines explaining why this should change now.",
    "- `solutions`: concise actionable fix; include markdown bullets/snippet only if needed.",
    "- `benefit`: 1-2 short lines with concrete gains from applying the change.",
    "- Keep each suggestion concise. Avoid long paragraphs and avoid repeating PR summary content.",
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
    '  "pr_description": "<3-6 concise bullet points describing exactly what changed in this PR>",',
    '  "pr_summary": "<5-10 lines max>",',
    '  "strengths": "<5-10 lines max>",',
    '  "improvements": "<5-10 lines max>",',
    '  "suggestions": [',
    "    {",
    '      "level": "Low | Medium | Important | Critical",',
    '      "title": "<short suggestion title>",',
    '      "reason": "<why this should change now>",',
    '      "solutions": "<actionable solution(s), markdown allowed>",',
    '      "benefit": "<what we gain with this change>",',
    '      "applied": false',
    "    }",
    "  ],",
    '  "final_veredic": "<critical recommendation, what can be deferred, and whether to create a Jira ticket>"',
    "}",
    "",
    "Hard constraints:",
    "- Write valid JSON only to the output file (no comments, no trailing commas).",
    "- Include all required keys exactly as specified.",
    "- Do not add extra keys inside `suggestions[]`.",
    "- `pr_description` should be concise bullet points (markdown list).",
    "- `suggestions[].applied` must always be `false` in generated reviews.",
    "- Every suggestion must include non-empty `title`, `reason`, `solutions`, and `benefit`.",
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
      parseError: "Field `metadata` must be an object",
    };
  }

  const prSummary = firstNonEmpty(
    normalizeRichTextField(src.pr_summary),
    normalizeRichTextField(src.summary)
  ) ?? "";
  const prDescription = firstNonEmpty(
    normalizeRichTextField(src.pr_description),
    normalizeRichTextField(src.prDescription),
    normalizeRichTextField(src.description),
    normalizeRichTextField(metadata.pr_description),
    prSummary
  ) ?? "";
  const strengths = normalizeRichTextField(src.strengths) ?? "";
  const improvements = normalizeRichTextField(src.improvements) ?? "";
  const finalVeredic = firstNonEmpty(
    normalizeRichTextField(src.final_veredic),
    normalizeRichTextField(src.final_verdict)
  ) ?? "";

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
      pr_description: prDescription,
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
    const normalized = normalizeMetadataValue(value);
    if (normalized == null) continue;
    out[String(key)] = normalized;
  }
  return out;
}

function normalizeSuggestion(input: unknown): PullRequestAgentReviewSuggestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const src = input as Record<string, unknown>;
  const level = asStringOrNull(src.level);
  if (!level) return null;
  if (!ALLOWED_REVIEW_LEVELS.has(level as PullRequestAgentReviewLevel)) {
    return null;
  }
  if (typeof src.applied !== "boolean") return null;

  const titleInput = asStringOrNull(src.title);
  const reasonInput = asStringOrNull(src.reason);
  const solutionsInput = asStringOrNull(src.solutions);
  const benefitInput = asStringOrNull(src.benefit);
  const legacyContent = asStringOrNull(src.content);

  const legacy = parseSuggestionSectionsFromContent(legacyContent);
  const reason = firstNonEmpty(
    reasonInput,
    legacy.reason,
    legacyContent
  );
  const solutions = firstNonEmpty(
    solutionsInput,
    legacy.solutions
  );
  const benefit = firstNonEmpty(
    benefitInput,
    legacy.benefit
  );
  const inferredTitle = inferSuggestionTitle(reason, solutions, benefit);
  const title = firstNonEmpty(
    titleInput,
    legacy.title,
    inferredTitle,
    "Suggestion"
  );

  if (!reason && !solutions && !benefit) {
    return null;
  }

  const normalizedReason = reason || "No reason provided.";
  const normalizedSolutions = solutions || "No solution provided.";
  const normalizedBenefit = benefit || "No benefit provided.";
  const normalizedTitle = title || "Suggestion";

  return {
    level: level as PullRequestAgentReviewLevel,
    title: normalizedTitle,
    reason: normalizedReason,
    solutions: normalizedSolutions,
    benefit: normalizedBenefit,
    content: buildSuggestionContentMarkdown({
      title: normalizedTitle,
      reason: normalizedReason,
      solutions: normalizedSolutions,
      benefit: normalizedBenefit,
    }),
    applied: src.applied,
  };
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function normalizeMetadataValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeMetadataValue(item))
      .filter((item): item is string => Boolean(item && item.trim()))
      .map((item) => collapseWhitespace(item));
    if (items.length === 0) return null;
    return items.join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeRichTextField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "";
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeRichTextField(item))
      .filter((item): item is string => item != null && item.trim().length > 0);
    if (items.length === 0) return "";
    return items.map((item) => `- ${collapseWhitespace(item)}`).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const normalizedValue = normalizeRichTextField(entryValue);
        if (normalizedValue == null || normalizedValue.trim().length === 0) return null;
        return `- ${key}: ${collapseWhitespace(normalizedValue)}`;
      })
      .filter((item): item is string => Boolean(item));
    if (entries.length === 0) return "";
    return entries.join("\n");
  }
  return null;
}

type ParsedSuggestionSections = {
  title: string | null;
  reason: string | null;
  solutions: string | null;
  benefit: string | null;
};

type SuggestionSectionKey = "reason" | "solutions" | "benefit";

function parseSuggestionSectionsFromContent(content: string | null): ParsedSuggestionSections {
  const raw = String(content ?? "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return {
      title: null,
      reason: null,
      solutions: null,
      benefit: null,
    };
  }

  const reasonLines: string[] = [];
  const solutionsLines: string[] = [];
  const benefitLines: string[] = [];
  const prefaceLines: string[] = [];
  let currentSection: SuggestionSectionKey | null = null;
  let title: string | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!title) {
      const headingTitle = extractHeadingTitle(trimmed);
      if (headingTitle) {
        title = headingTitle;
        continue;
      }
    }

    const sectionMatch = parseSuggestionSectionHeader(trimmed);
    if (sectionMatch) {
      currentSection = sectionMatch.section;
      if (sectionMatch.inlineText) {
        getSuggestionSectionLines(
          sectionMatch.section,
          reasonLines,
          solutionsLines,
          benefitLines
        ).push(sectionMatch.inlineText);
      }
      continue;
    }

    if (currentSection) {
      getSuggestionSectionLines(
        currentSection,
        reasonLines,
        solutionsLines,
        benefitLines
      ).push(line);
    } else {
      prefaceLines.push(line);
    }
  }

  const preface = normalizeMarkdownBlock(prefaceLines);
  let reason = normalizeMarkdownBlock(reasonLines);
  let solutions = normalizeMarkdownBlock(solutionsLines);
  const benefit = normalizeMarkdownBlock(benefitLines);

  if (preface) {
    if (!reason) {
      reason = preface;
    } else if (!solutions) {
      solutions = preface;
    }
  }

  return {
    title,
    reason: reason || null,
    solutions: solutions || null,
    benefit: benefit || null,
  };
}

function parseSuggestionSectionHeader(
  line: string
): { section: SuggestionSectionKey; inlineText: string | null } | null {
  if (!line) return null;

  const patterns: Array<{ section: SuggestionSectionKey; regex: RegExp }> = [
    {
      section: "reason",
      regex: /^(?:#{1,6}\s*)?(?:\*\*|__)?why(?:\s+change(?:\s+now)?)?(?:\*\*|__)?\s*:?\s*(.*)$/i,
    },
    {
      section: "solutions",
      regex: /^(?:#{1,6}\s*)?(?:\*\*|__)?(?:solution(?:s)?|recommendation(?:s)?)(?:\*\*|__)?\s*:?\s*(.*)$/i,
    },
    {
      section: "solutions",
      regex: /^(?:#{1,6}\s*)?(?:\*\*|__)?code snippet(?:\s*\(optional\))?(?:\*\*|__)?\s*:?\s*(.*)$/i,
    },
    {
      section: "benefit",
      regex: /^(?:#{1,6}\s*)?(?:\*\*|__)?(?:benefit(?:s)?|what we gain)(?:\*\*|__)?\s*:?\s*(.*)$/i,
    },
  ];

  const candidates = [line, stripOuterMarkdownEmphasis(line)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const pattern of patterns) {
      const match = candidate.match(pattern.regex);
      if (!match) continue;
      const inlineText = normalizeInlineMarkdown(match[1] ?? "");
      return {
        section: pattern.section,
        inlineText: inlineText || null,
      };
    }
  }

  return null;
}

function stripOuterMarkdownEmphasis(line: string): string {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return "";
  const strong = trimmed.match(/^\*\*(.+)\*\*$/);
  if (strong?.[1]) return strong[1].trim();
  const underscore = trimmed.match(/^__(.+)__$/);
  if (underscore?.[1]) return underscore[1].trim();
  return trimmed;
}

function extractHeadingTitle(line: string): string | null {
  const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
  if (!match) return null;
  return collapseWhitespace(match[1]);
}

function getSuggestionSectionLines(
  section: SuggestionSectionKey,
  reasonLines: string[],
  solutionsLines: string[],
  benefitLines: string[]
): string[] {
  if (section === "reason") return reasonLines;
  if (section === "solutions") return solutionsLines;
  return benefitLines;
}

function normalizeInlineMarkdown(value: string): string {
  return collapseWhitespace(value.replace(/\s*\\n\s*/g, " "));
}

function normalizeMarkdownBlock(lines: string[] | string): string {
  const source = Array.isArray(lines) ? lines.slice() : String(lines ?? "").split(/\r?\n/g);
  let start = 0;
  let end = source.length;
  while (start < end && source[start].trim() === "") start++;
  while (end > start && source[end - 1].trim() === "") end--;
  return source.slice(start, end).join("\n").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    return normalized;
  }
  return null;
}

function inferSuggestionTitle(
  reason: string | null,
  solutions: string | null,
  benefit: string | null
): string | null {
  const source = firstNonEmpty(reason, solutions, benefit);
  if (!source) return null;
  const firstLine = source
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const cleaned = collapseWhitespace(
    firstLine
      .replace(/^[-*]\s+/, "")
      .replace(/[`*_#]/g, "")
  );

  if (!cleaned) return null;
  return cleaned.length > 90
    ? `${cleaned.slice(0, 87).trimEnd()}...`
    : cleaned;
}

function buildSuggestionContentMarkdown(params: {
  title: string;
  reason: string;
  solutions: string;
  benefit: string;
}): string {
  return [
    `## ${params.title}`,
    "",
    "**Why:**",
    params.reason,
    "",
    "**Solution/Solutions:**",
    params.solutions,
    "",
    "**Benefit:**",
    params.benefit,
  ].join("\n").trim();
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

  lines.push("## PR Description");
  lines.push("");
  lines.push(review.pr_description || "_No PR description provided._");
  lines.push("");

  lines.push("## Summary");
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
      lines.push(`### ${i + 1}. ${suggestion.title} (${suggestion.level})`);
      lines.push("");
      lines.push("**Why:**");
      lines.push(suggestion.reason || "_No reason provided._");
      lines.push("");
      lines.push("**Solution/Solutions:**");
      lines.push(suggestion.solutions || "_No solutions provided._");
      lines.push("");
      lines.push("**Benefit:**");
      lines.push(suggestion.benefit || "_No benefit provided._");
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
