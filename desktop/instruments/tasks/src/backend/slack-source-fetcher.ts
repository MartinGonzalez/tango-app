import type { FetchTaskSourceResult } from "./task-source-fetcher.ts";

const DEFAULT_MESSAGE_LIMIT = 30;

type ParsedSlackPermalink = {
  channelId: string;
  messageTs: string;
  threadTs: string | null;
};

type SlackMessage = {
  ts: string;
  text: string;
  user: string | null;
  botId: string | null;
};

export async function fetchSlackSourceFromPermalink(
  permalink: string,
  accessToken: string,
  opts?: {
    messageLimit?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<FetchTaskSourceResult> {
  const parsed = parseSlackPermalink(permalink);
  if (!parsed) {
    return {
      kind: "slack",
      title: null,
      content: null,
      fetchStatus: "network_error",
      httpStatus: null,
      error: "Invalid Slack permalink",
      fetchedAt: null,
    };
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const messageLimit = Math.max(1, Math.min(100, Math.floor(opts?.messageLimit ?? DEFAULT_MESSAGE_LIMIT)));
  const threadTs = parsed.threadTs ?? parsed.messageTs;
  const apiUrl = new URL("https://slack.com/api/conversations.replies");
  apiUrl.searchParams.set("channel", parsed.channelId);
  apiUrl.searchParams.set("ts", threadTs);
  apiUrl.searchParams.set("limit", String(messageLimit));
  apiUrl.searchParams.set("inclusive", "true");

  try {
    const response = await fetchImpl(apiUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const fetchedAt = new Date().toISOString();
    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      return {
        kind: "slack",
        title: null,
        content: null,
        fetchStatus: "http_error",
        httpStatus: response.status,
        error: `Slack API HTTP ${response.status}`,
        fetchedAt,
      };
    }

    const bag = isRecord(payload) ? payload : {};
    const ok = bag.ok === true;
    if (!ok) {
      const errorCode = normalizeNullableString(bag.error) ?? "unknown_error";
      return {
        kind: "slack",
        title: null,
        content: null,
        fetchStatus: "http_error",
        httpStatus: response.status,
        error: mapSlackErrorToMessage(errorCode),
        fetchedAt,
      };
    }

    const messages = toSlackMessages(bag.messages).slice(0, messageLimit);
    const root = messages[0] ?? null;
    const title = root?.text
      ? truncateSingleLine(root.text, 120)
      : `Slack ${parsed.channelId} ${parsed.messageTs}`;
    const content = renderSlackThread(permalink, parsed.channelId, threadTs, messages);

    return {
      kind: "slack",
      title,
      content,
      fetchStatus: "success",
      httpStatus: response.status,
      error: null,
      fetchedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "slack",
      title: null,
      content: null,
      fetchStatus: "network_error",
      httpStatus: null,
      error: message || "Slack fetch failed",
      fetchedAt: null,
    };
  }
}

export function parseSlackPermalink(input: string): ParsedSlackPermalink | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!host.endsWith(".slack.com") && !host.endsWith(".slack-gov.com")) {
    return null;
  }

  const match = parsedUrl.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d{10,20})/i);
  if (!match) return null;

  const channelId = match[1].toUpperCase();
  const messageTs = permalinkTsToSlackTs(match[2]);
  if (!messageTs) return null;

  const threadRaw = normalizeNullableString(parsedUrl.searchParams.get("thread_ts"));
  const threadTs = threadRaw
    ? normalizeSlackTimestamp(threadRaw)
    : null;

  return {
    channelId,
    messageTs,
    threadTs,
  };
}

function mapSlackErrorToMessage(errorCode: string): string {
  const code = errorCode.toLowerCase();
  const actionable = new Set([
    "not_authed",
    "invalid_auth",
    "token_revoked",
    "account_inactive",
    "missing_scope",
    "not_in_channel",
    "channel_not_found",
    "access_denied",
  ]);
  if (actionable.has(code)) {
    return `Connect Slack in Connectors to fetch this source (${code})`;
  }
  return `Slack API error: ${code}`;
}

function toSlackMessages(input: unknown): SlackMessage[] {
  if (!Array.isArray(input)) return [];
  const out: SlackMessage[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const ts = normalizeSlackTimestamp(raw.ts);
    if (!ts) continue;
    out.push({
      ts,
      text: normalizeNullableString(raw.text) ?? "",
      user: normalizeNullableString(raw.user),
      botId: normalizeNullableString(raw.bot_id),
    });
  }
  return out;
}

function renderSlackThread(
  permalink: string,
  channelId: string,
  threadTs: string,
  messages: SlackMessage[]
): string {
  const lines: string[] = [
    `Slack permalink: ${permalink}`,
    `Channel: ${channelId}`,
    `Thread ts: ${threadTs}`,
    "",
    `Messages (${messages.length}):`,
  ];

  for (const message of messages) {
    const authoredAt = tsToIso(message.ts);
    const author = message.user
      ? `@${message.user}`
      : message.botId
        ? `bot:${message.botId}`
        : "unknown";
    const text = message.text.trim() || "(no text)";
    lines.push(`- [${authoredAt}] ${author}: ${text}`);
  }

  return lines.join("\n");
}

function tsToIso(ts: string): string {
  const value = Number(ts);
  if (!Number.isFinite(value)) return ts;
  return new Date(Math.round(value * 1000)).toISOString();
}

function truncateSingleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function permalinkTsToSlackTs(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length <= 6) return null;
  const head = digits.slice(0, digits.length - 6);
  const tail = digits.slice(-6);
  return `${Number(head)}.${tail}`;
}

function normalizeSlackTimestamp(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (/^\d+\.\d+$/.test(normalized)) return normalized;
  if (/^\d{10,20}$/.test(normalized)) {
    return permalinkTsToSlackTs(normalized);
  }
  return null;
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
