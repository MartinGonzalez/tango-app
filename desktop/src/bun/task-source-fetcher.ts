import type { TaskSourceFetchStatus, TaskSourceKind } from "../shared/types.ts";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 24 * 1024;

export type FetchTaskSourceOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

export type FetchTaskSourceResult = {
  kind: TaskSourceKind;
  title: string | null;
  content: string | null;
  fetchStatus: TaskSourceFetchStatus;
  httpStatus: number | null;
  error: string | null;
  fetchedAt: string | null;
};

export async function fetchTaskSourceFromUrl(
  url: string,
  opts: FetchTaskSourceOptions = {}
): Promise<FetchTaskSourceResult> {
  const kind = inferSourceKindFromUrl(url);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Claudex-TaskFetcher/1.0",
        Accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.7",
      },
    });

    const fetchedAt = new Date().toISOString();
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const raw = await readBodyLimited(response, maxBytes);

    if (!response.ok) {
      return {
        kind,
        title: deriveTitle(url, raw, contentType),
        content: truncateText(raw, maxBytes),
        fetchStatus: "http_error",
        httpStatus: response.status,
        error: `HTTP ${response.status}`,
        fetchedAt,
      };
    }

    const text = normalizeFetchedText(raw, contentType);
    return {
      kind,
      title: deriveTitle(url, raw, contentType),
      content: truncateText(text, maxBytes),
      fetchStatus: "success",
      httpStatus: response.status,
      error: null,
      fetchedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind,
      title: null,
      content: null,
      fetchStatus: "network_error",
      httpStatus: null,
      error: message,
      fetchedAt: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function inferSourceKindFromUrl(url: string): TaskSourceKind {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("atlassian.net") || host.includes("jira")) {
      return "jira";
    }
    if (host.includes("slack.com") || host.includes("slack-edge.com")) {
      return "slack";
    }
    return "url";
  } catch {
    return "url";
  }
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      const allowed = value.slice(0, Math.max(0, value.byteLength - (total - maxBytes)));
      result += decoder.decode(allowed, { stream: true });
      break;
    }

    result += decoder.decode(value, { stream: true });
  }

  result += decoder.decode();
  return result;
}

function normalizeFetchedText(raw: string, contentType: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  if (contentType.includes("text/html") || /^\s*</.test(trimmed)) {
    return htmlToText(trimmed);
  }

  return trimmed;
}

function deriveTitle(url: string, raw: string, contentType: string): string | null {
  const text = String(raw ?? "");

  if (contentType.includes("text/html") || /^\s*</.test(text.trim())) {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      const title = decodeHtmlEntities(htmlToText(titleMatch[1])).trim();
      if (title) return title.slice(0, 200);
    }
  }

  try {
    const parsed = new URL(url);
    const leaf = parsed.pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
    return leaf || parsed.hostname;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const withNewlines = withoutScripts
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|br|section|article)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t");

  const stripped = withNewlines.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(stripped);

  return decoded
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
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
