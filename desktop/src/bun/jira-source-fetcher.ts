import type { TaskSourceFetchStatus } from "../shared/types.ts";
import type { JiraAuthContext } from "./connectors-repository.ts";

const JIRA_API_BASE = "https://api.atlassian.com/ex/jira";
const DEFAULT_COMMENT_LIMIT = 30;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 24 * 1024;

export type JiraSourceFetchOptions = {
  commentLimit?: number;
  timeoutMs?: number;
  maxBytes?: number;
};

export type JiraSourceFetchResult = {
  kind: "jira";
  title: string | null;
  content: string | null;
  fetchStatus: TaskSourceFetchStatus;
  httpStatus: number | null;
  error: string | null;
  fetchedAt: string | null;
};

export async function fetchJiraSourceFromUrl(
  sourceUrl: string,
  auth: JiraAuthContext,
  opts: JiraSourceFetchOptions = {}
): Promise<JiraSourceFetchResult> {
  const issueKey = parseJiraIssueKeyFromUrl(sourceUrl);
  if (!issueKey) {
    return {
      kind: "jira",
      title: null,
      content: null,
      fetchStatus: "network_error",
      httpStatus: null,
      error: "Unsupported Jira URL. Use an issue URL like /browse/ABC-123.",
      fetchedAt: null,
    };
  }

  const commentLimit = Math.max(1, Math.min(100, opts.commentLimit ?? DEFAULT_COMMENT_LIMIT));
  const timeoutMs = Math.max(1_000, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(2_048, opts.maxBytes ?? DEFAULT_MAX_BYTES);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const issueResponse = await fetch(buildJiraIssueUrl(auth.cloudId, issueKey), {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
      },
    });

    const issuePayload = await parseJsonSafe(issueResponse);
    if (!issueResponse.ok) {
      return jiraHttpError(issueResponse.status, issuePayload);
    }

    const commentsResponse = await fetch(
      buildJiraCommentsUrl(auth.cloudId, issueKey, commentLimit),
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
      }
    );

    const commentsPayload = await parseJsonSafe(commentsResponse);
    const commentsError = commentsResponse.ok ? null : parseJiraApiError(commentsPayload);

    const issue = parseJiraIssue(issuePayload);
    const comments = commentsResponse.ok
      ? parseJiraComments(commentsPayload).slice(0, commentLimit)
      : [];

    const title = `${issue.key}: ${issue.summary}`;
    const content = truncateText(
      renderJiraIssueContent(issue, comments, commentsError),
      maxBytes
    );

    return {
      kind: "jira",
      title,
      content,
      fetchStatus: "success",
      httpStatus: issueResponse.status,
      error: null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "jira",
      title: null,
      content: null,
      fetchStatus: "network_error",
      httpStatus: null,
      error: message,
      fetchedAt: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJiraIssueKeyFromUrl(sourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  const pathname = url.pathname;
  const browseMatch = pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/i);
  if (browseMatch?.[1]) {
    return browseMatch[1].toUpperCase();
  }

  const directMatch = pathname.match(/\/issues?\/([A-Z][A-Z0-9_]*-\d+)/i);
  if (directMatch?.[1]) {
    return directMatch[1].toUpperCase();
  }

  return null;
}

type ParsedIssue = {
  key: string;
  summary: string;
  description: string;
  project: string | null;
  status: string | null;
  issueType: string | null;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ParsedComment = {
  author: string | null;
  createdAt: string | null;
  body: string;
};

function buildJiraIssueUrl(cloudId: string, issueKey: string): string {
  const query = new URLSearchParams();
  query.set(
    "fields",
    "summary,description,issuetype,project,status,priority,assignee,reporter,created,updated"
  );
  return `${JIRA_API_BASE}/${encodeURIComponent(cloudId)}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${query.toString()}`;
}

function buildJiraCommentsUrl(cloudId: string, issueKey: string, maxResults: number): string {
  const query = new URLSearchParams();
  query.set("maxResults", String(maxResults));
  return `${JIRA_API_BASE}/${encodeURIComponent(cloudId)}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${query.toString()}`;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function jiraHttpError(status: number, payload: unknown): JiraSourceFetchResult {
  const error = parseJiraApiError(payload)
    || (status === 401 || status === 403
      ? "Connect Jira in Connectors to fetch this source"
      : `HTTP ${status}`);

  return {
    kind: "jira",
    title: null,
    content: null,
    fetchStatus: "http_error",
    httpStatus: status,
    error,
    fetchedAt: new Date().toISOString(),
  };
}

function parseJiraApiError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const errorMessages = Array.isArray(payload.errorMessages)
    ? payload.errorMessages
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
    : [];
  if (errorMessages.length > 0) {
    return errorMessages.join("; ");
  }

  if (isRecord(payload.errors)) {
    const parts = Object.values(payload.errors)
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("; ");
    }
  }

  const message = normalizeNullableString(payload.message)
    ?? normalizeNullableString(payload.error);
  if (message) return message;

  return null;
}

function parseJiraIssue(payload: unknown): ParsedIssue {
  const root = isRecord(payload) ? payload : {};
  const fields = isRecord(root.fields) ? root.fields : {};

  const key = normalizeNullableString(root.key) ?? "UNKNOWN";
  const summary = normalizeNullableString(fields.summary) ?? "Untitled issue";
  const description = adfToText(fields.description);

  const project = asNamedEntity(fields.project);
  const status = asNamedEntity(fields.status);
  const issueType = asNamedEntity(fields.issuetype);
  const priority = asNamedEntity(fields.priority);
  const assignee = asDisplayName(fields.assignee);
  const reporter = asDisplayName(fields.reporter);

  return {
    key,
    summary,
    description,
    project,
    status,
    issueType,
    priority,
    assignee,
    reporter,
    createdAt: normalizeNullableString(fields.created),
    updatedAt: normalizeNullableString(fields.updated),
  };
}

function parseJiraComments(payload: unknown): ParsedComment[] {
  const root = isRecord(payload) ? payload : {};
  const comments = Array.isArray(root.comments) ? root.comments : [];

  const parsed: ParsedComment[] = [];
  for (const item of comments) {
    if (!isRecord(item)) continue;
    const author = asDisplayName(item.author);
    const createdAt = normalizeNullableString(item.created);
    const body = adfToText(item.body);
    if (!body) continue;
    parsed.push({
      author,
      createdAt,
      body,
    });
  }

  return parsed;
}

function asNamedEntity(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return normalizeNullableString(value.name);
}

function asDisplayName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return normalizeNullableString(value.displayName)
    ?? normalizeNullableString(value.accountId)
    ?? normalizeNullableString(value.name);
}

function renderJiraIssueContent(
  issue: ParsedIssue,
  comments: ParsedComment[],
  commentsError: string | null
): string {
  const lines: string[] = [
    `Jira issue ${issue.key}`,
    `Summary: ${issue.summary}`,
  ];

  if (issue.project) lines.push(`Project: ${issue.project}`);
  if (issue.status) lines.push(`Status: ${issue.status}`);
  if (issue.issueType) lines.push(`Type: ${issue.issueType}`);
  if (issue.priority) lines.push(`Priority: ${issue.priority}`);
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee}`);
  if (issue.reporter) lines.push(`Reporter: ${issue.reporter}`);
  if (issue.createdAt) lines.push(`Created: ${issue.createdAt}`);
  if (issue.updatedAt) lines.push(`Updated: ${issue.updatedAt}`);

  lines.push("");
  lines.push("Description");
  lines.push(issue.description || "(empty)");

  lines.push("");
  lines.push(`Comments (${comments.length})`);
  if (comments.length === 0) {
    lines.push(commentsError ? `(comments unavailable: ${commentsError})` : "(none)");
  } else {
    for (const comment of comments) {
      const headerParts = [comment.author, comment.createdAt].filter(Boolean);
      lines.push(`- ${headerParts.join(" · ") || "Comment"}`);
      lines.push(comment.body);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map((entry) => adfToText(entry)).filter(Boolean).join("\n");
  }
  if (!isRecord(node)) return "";

  const type = String(node.type ?? "").toLowerCase();
  if (type === "text") {
    return String(node.text ?? "");
  }
  if (type === "hardbreak") {
    return "\n";
  }

  const children = Array.isArray(node.content) ? node.content : [];
  const parts = children.map((entry) => adfToText(entry)).filter(Boolean);

  if (type === "listitem") {
    const line = parts.join(" ").trim();
    return line ? `- ${line}` : "";
  }

  if (type === "paragraph" || type === "heading" || type === "blockquote") {
    return parts.join("").trim();
  }

  if (type === "codeblock") {
    const code = parts.join("\n").trim();
    return code ? `\`\`\`\n${code}\n\`\`\`` : "";
  }

  if (type === "doc" || type === "bulletlist" || type === "orderedlist" || type === "panel") {
    return parts.join("\n").trim();
  }

  return parts.join(" ").trim();
}

function truncateText(input: string, maxBytes: number): string {
  const text = String(input ?? "");
  if (!text) return "";

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= maxBytes) return text;

  const clipped = new TextDecoder().decode(bytes.slice(0, maxBytes));
  return `${clipped}\n\n[truncated]`;
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
