export type ToolApprovalRequest = {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
};

export type SlashCommandSource = "project" | "user";

export type SlashCommandEntry = {
  name: string;
  source: SlashCommandSource;
};
