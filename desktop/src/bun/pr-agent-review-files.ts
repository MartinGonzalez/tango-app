import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_REVIEW_BASE_DIR = join(homedir(), ".tango");
export const AGENT_REVIEW_FILE_EXTENSION = ".json";
export const AGENT_REVIEW_LEGACY_FILE_EXTENSION = ".md";
export const AGENT_REVIEW_PLACEHOLDER_KEY = "__claudex_agent_review_placeholder";
export const AGENT_REVIEW_PLACEHOLDER_TEXT = "Agent review is running";

export function sanitizeRepoSlug(repo: string): string {
  return String(repo ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/[\\/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "repo";
}

export function buildAgentReviewFileName(
  repo: string,
  number: number,
  version: number
): string {
  const safeVersion = Number.isFinite(version) ? Math.max(1, Math.trunc(version)) : 1;
  const base = `${sanitizeRepoSlug(repo)}-pr${Math.max(0, Math.trunc(number))}-agent-review`;
  if (safeVersion <= 1) {
    return `${base}${AGENT_REVIEW_FILE_EXTENSION}`;
  }
  return `${base}-${safeVersion}${AGENT_REVIEW_FILE_EXTENSION}`;
}

export function buildAgentReviewFilePath(
  repo: string,
  number: number,
  version: number,
  baseDir: string = AGENT_REVIEW_BASE_DIR
): string {
  return join(baseDir, buildAgentReviewFileName(repo, number, version));
}

export function parseAgentReviewVersionFromFileName(
  repo: string,
  number: number,
  fileName: string
): number | null {
  return parseVersionFromFileName(repo, number, fileName, AGENT_REVIEW_FILE_EXTENSION);
}

export function parseLegacyAgentReviewVersionFromFileName(
  repo: string,
  number: number,
  fileName: string
): number | null {
  return parseVersionFromFileName(repo, number, fileName, AGENT_REVIEW_LEGACY_FILE_EXTENSION);
}

export function isLegacyAgentReviewFileName(fileName: string): boolean {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  return /-agent-review(?:-\d+)?\.md$/.test(normalized);
}

export function isAgentReviewPlaceholderPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Boolean((value as Record<string, unknown>)[AGENT_REVIEW_PLACEHOLDER_KEY]);
}

function parseVersionFromFileName(
  repo: string,
  number: number,
  fileName: string,
  fileExtension: string
): number | null {
  const normalized = String(fileName ?? "").trim();
  if (!normalized.endsWith(fileExtension)) return null;

  const base = `${sanitizeRepoSlug(repo)}-pr${Math.max(0, Math.trunc(number))}-agent-review`;
  const simple = `${base}${fileExtension}`;
  if (normalized === simple) return 1;

  const match = normalized.match(
    new RegExp(`^${escapeForRegex(base)}-(\\d+)${escapeForRegex(fileExtension)}$`)
  );
  if (!match) return null;
  const version = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(version) || version <= 1) return null;
  return version;
}

function escapeForRegex(text: string): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
