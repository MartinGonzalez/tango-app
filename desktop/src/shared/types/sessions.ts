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

export type HistorySession = {
  sessionId: string;
  cwd: string | null;
  prompt: string | null;
  topic: string | null;
  model: string | null;
  startedAt: string | null;
  lastActiveAt: string | null;
  transcriptPath: string;
};
