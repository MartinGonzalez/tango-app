import { readFile } from "node:fs/promises";
import type { TranscriptMessage } from "../shared/types.ts";

/**
 * Reads a Claude Code JSONL transcript and returns all messages.
 * Each line is a JSON object with `type` (user/assistant/system) and `message.content`.
 */
export async function readTranscript(filePath: string): Promise<TranscriptMessage[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  if (!raw.trim()) return [];

  const messages: TranscriptMessage[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const msg = parseEntry(entry);
    if (msg) messages.push(msg);
  }

  return messages;
}

function parseEntry(entry: any): TranscriptMessage | null {
  if (!entry || typeof entry !== "object") return null;

  const role = entry.type as string;
  if (!["user", "assistant", "system"].includes(role)) return null;
  if (entry.isMeta === true) return null;

  // Check if this message contains a tool_result block (Claude sends these as "user" role)
  let hasToolResult = false;
  if (entry.message?.content && Array.isArray(entry.message.content)) {
    hasToolResult = entry.message.content.some((b: any) => b.type === "tool_result");
  }

  // If this is a tool result message, skip it (don't render as user message)
  // Tool results are already shown in the tool block from the assistant message
  if (role === "user" && hasToolResult) {
    return null;
  }

  let content = extractContent(entry.message?.content);
  if (content === null) return null;

  if (role === "user") {
    content = normalizeUserMessageContent(content);
    if (content === null) return null;
  }

  const msg: TranscriptMessage = {
    role: role as TranscriptMessage["role"],
    content,
  };

  // For assistant messages with tool_use blocks, extract tool info
  if (role === "assistant" && entry.message?.content && Array.isArray(entry.message.content)) {
    const toolUse = entry.message.content.find(
      (b: any) => b.type === "tool_use"
    );
    if (toolUse) {
      msg.toolName = toolUse.name;
      msg.toolInput = toolUse.input;
    }
  }

  if (entry.timestamp) {
    msg.timestamp = entry.timestamp;
  }

  return msg;
}

function extractContent(content: unknown): string | null {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        parts.push(`[Tool: ${block.name}]`);
      }
      // Skip tool_result blocks - they're handled separately
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  return null;
}

function normalizeUserMessageContent(content: string): string | null {
  const commandName = extractCommandName(content);
  if (commandName) return commandName;

  const normalized = content.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractCommandName(content: string): string | null {
  const commandNameMatch = content.match(
    /<command-name>\s*([^<\n]+?)\s*<\/command-name>/i
  );
  if (commandNameMatch?.[1]) {
    return normalizeCommandName(commandNameMatch[1]);
  }

  const commandMessageMatch = content.match(
    /<command-message>\s*([\s\S]*?)\s*<\/command-message>/i
  );
  if (commandMessageMatch?.[1]) {
    return normalizeCommandName(commandMessageMatch[1]);
  }

  return null;
}

function normalizeCommandName(value: string): string | null {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
