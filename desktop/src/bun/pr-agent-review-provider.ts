import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewRun,
} from "../shared/types.ts";
import {
  AGENT_REVIEW_BASE_DIR,
  AGENT_REVIEW_PLACEHOLDER_MARKER,
  AGENT_REVIEW_PLACEHOLDER_TEXT,
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
    await mkdir(this.#baseDir, { recursive: true });
    await writeFile(run.filePath, buildAgentReviewPlaceholderMarkdown(run));
  }

  async writeFailedDocument(run: PullRequestAgentReviewRun, error: string): Promise<void> {
    await mkdir(this.#baseDir, { recursive: true });
    await writeFile(run.filePath, buildAgentReviewFailureMarkdown(run, error));
  }

  async ensureCompletedDocument(run: PullRequestAgentReviewRun, resultText: string): Promise<void> {
    const current = await readFileOrNull(run.filePath);
    if (current && !current.includes(AGENT_REVIEW_PLACEHOLDER_MARKER)) {
      return;
    }

    const fallbackMarkdown = buildAgentReviewFallbackMarkdown(run, resultText);
    await mkdir(this.#baseDir, { recursive: true });
    await writeFile(run.filePath, fallbackMarkdown);
  }

  async getDocument(run: PullRequestAgentReviewRun): Promise<PullRequestAgentReviewDocument | null> {
    const markdown = await readFileOrNull(run.filePath);
    if (markdown == null) return null;
    return {
      run,
      markdown,
    };
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
    "Run a pull request code review using the skill `pr-reviewer`.",
    "",
    `Repository: ${repo}`,
    `Pull Request: #${number}`,
    `Head SHA: ${headSha || "(unknown)"}`,
    `Output markdown file (overwrite this exact file): ${outputFilePath}`,
    "",
    "Rules:",
    "1. Produce a clear markdown review with findings, risk summary, and follow-up checks.",
    "2. Overwrite the output file with the final review content. Do not leave placeholder text.",
    "3. If the local cwd does not contain this repository, use GitHub CLI with `gh -R <owner/repo>`.",
    "4. Keep the review focused on actionable engineering feedback.",
    "",
    cwdSource === "workspace"
      ? `Execution context: local workspace available at ${workspacePath}`
      : "Execution context: no local workspace match found; use gh with -R for repository-scoped commands.",
  ].join("\n");
}

export function buildAgentReviewPlaceholderMarkdown(
  run: PullRequestAgentReviewRun
): string {
  return [
    AGENT_REVIEW_PLACEHOLDER_MARKER,
    "# Agent Review",
    "",
    `${AGENT_REVIEW_PLACEHOLDER_TEXT}...`,
    "",
    `- Repository: ${run.repo}`,
    `- PR: #${run.number}`,
    `- Version: v${run.version}`,
    `- Head SHA: ${run.headSha || "(unknown)"}`,
    `- Started: ${run.startedAt}`,
    "",
    "The assistant is generating this review.",
  ].join("\n");
}

export function buildAgentReviewFallbackMarkdown(
  run: PullRequestAgentReviewRun,
  resultText: string
): string {
  const output = String(resultText ?? "").trim();
  return [
    "# Agent Review",
    "",
    `- Repository: ${run.repo}`,
    `- PR: #${run.number}`,
    `- Version: v${run.version}`,
    `- Head SHA: ${run.headSha || "(unknown)"}`,
    "",
    "## Result",
    "",
    output || "Agent review completed, but no markdown content was written by the reviewer.",
  ].join("\n");
}

export function buildAgentReviewFailureMarkdown(
  run: PullRequestAgentReviewRun,
  error: string
): string {
  const message = String(error ?? "Agent review failed").trim() || "Agent review failed";
  return [
    "# Agent Review",
    "",
    "Status: Failed",
    "",
    `- Repository: ${run.repo}`,
    `- PR: #${run.number}`,
    `- Version: v${run.version}`,
    `- Head SHA: ${run.headSha || "(unknown)"}`,
    "",
    "## Error",
    "",
    `\`${message.replace(/`/g, "'")}\``,
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
