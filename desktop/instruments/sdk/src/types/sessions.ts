import type { Activity } from "./activity.ts";

export type SessionInfo = {
  sessionId: string;
  topic: string | null;
  prompt: string | null;
  cwd: string | null;
  activity: Activity;
  model: string | null;
  contextPercentage: number | null;
  currentToolLabel: string | null;
  startedAt: string;
  updatedAt: string;
  isAppSpawned: boolean;
  transcriptPath: string | null;
};
