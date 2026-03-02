const MODEL_ALIASES: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6-20250527",
  opus: "claude-opus-4-6-20250527",
};

export function resolveModel(shortName?: string): string | undefined {
  if (!shortName?.trim()) return undefined;
  const key = shortName.trim().toLowerCase();
  return MODEL_ALIASES[key] ?? shortName;
}
