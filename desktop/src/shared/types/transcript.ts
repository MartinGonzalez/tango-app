export type TranscriptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timestamp?: string;
};
