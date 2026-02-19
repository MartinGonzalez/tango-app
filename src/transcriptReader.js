import { readFile } from "node:fs/promises";

const MAX_TOPIC_LENGTH = 120;

/**
 * Reads a Claude Code transcript JSONL file and extracts the first user prompt.
 * Returns { prompt, topic } or null if no user message found / file unreadable.
 */
export async function readPromptFromTranscript(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  if (!raw.trim()) {
    return null;
  }

  const lines = raw.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "user") continue;

    const content = entry.message?.content;
    if (!content) continue;

    const prompt = extractText(content);
    if (!prompt) continue;

    return { prompt, topic: deriveTopic(prompt) };
  }

  return null;
}

function extractText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join(" ");
  }

  return null;
}

function deriveTopic(prompt) {
  let text = prompt.split("\n")[0].trim();

  // Remove common filler phrases at the start
  const fillers = [
    /^(can you|could you|please|help me|i need to|i want to|let's|lets)\s+/i,
    /^(help|assist|fix|create|make|add|update|change|improve)\s+(me|us)\s+/i
  ];

  for (const filler of fillers) {
    text = text.replace(filler, "");
  }

  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // If still too long, take first meaningful chunk (up to 50 chars)
  if (text.length > 50) {
    // Try to break at a natural point (comma, "because", "so that", etc.)
    const breakPoints = [" because ", " so that ", " since ", ", "];
    for (const bp of breakPoints) {
      const idx = text.indexOf(bp);
      if (idx > 20 && idx < 50) {
        return text.slice(0, idx);
      }
    }
    // Otherwise just truncate at 50 chars
    return text.slice(0, 50).trim() + "...";
  }

  return text;
}
