export type TaskCardStatus =
  | "todo"
  | "in_progress"
  | "draft"
  | "planned"
  | "running"
  | "done"
  | "blocked"
  | "blocked_by"
  | "archived";

export type TaskAction = "improve" | "plan" | "execute";

export type TaskSourceKind = "jira" | "slack" | "url" | "manual";

export type TaskRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type TaskCardSummary = {
  id: string;
  stagePath: string;
  title: string;
  status: TaskCardStatus;
  updatedAt: string;
  hasPlan: boolean;
};

export type TaskSourceFetchStatus = "idle" | "success" | "http_error" | "network_error";

export type TaskSource = {
  id: string;
  taskId: string;
  kind: TaskSourceKind;
  url: string | null;
  title: string | null;
  content: string | null;
  fetchStatus: TaskSourceFetchStatus;
  httpStatus: number | null;
  error: string | null;
  fetchedAt: string | null;
  updatedAt: string;
};

export type TaskRun = {
  id: string;
  taskId: string;
  action: TaskAction;
  status: TaskRunStatus;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  output: string | null;
  error: string | null;
};

export type TaskCardDetail = {
  id: string;
  stagePath: string;
  title: string;
  notes: string;
  planMarkdown: string | null;
  status: TaskCardStatus;
  sources: TaskSource[];
  lastRun: TaskRun | null;
  createdAt: string;
  updatedAt: string;
};
