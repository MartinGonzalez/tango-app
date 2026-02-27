import type { Activity } from "./activity.ts";

export type Task = {
  sessionId: string;
  pid: number | null;
  title: string;
  cwd: string | null;
  status: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  lastNotes: string;
  transcriptPath: string | null;
  prompt: string | null;
  topic: string | null;
  contextPercentage: number | null;
  model: string | null;
  currentTool: string | null;
  currentToolLabel: string | null;
};

export type Subagent = {
  agentId: string;
  parentSessionId: string;
  agentType: string;
  description: string | null;
  currentTool: string | null;
  toolHistory: { tool: string; at: string }[];
  subagentSessionId: string | null;
  startedAt: string;
};

export type ProcessInfo = {
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  stat: string;
  elapsed: string;
  command: string;
  state: string;
  appName: string;
  seenAt: string;
  task: Task | null;
  activity: Activity;
  attribution: string;
};

export type Snapshot = {
  timestamp: string;
  processes: ProcessInfo[];
  tasks: Task[];
  subagents: Subagent[];
  eventCount: number;
};
