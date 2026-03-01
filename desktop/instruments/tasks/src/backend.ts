import { TaskRepository } from "./backend/task-repository.ts";
import { TasksStore } from "./backend/tasks-store.ts";
import {
  defineBackend,
  type InstrumentBackendContext,
} from "@tango/api/backend";
import type {
  ConnectorProvider,
  TaskAction,
  TaskSourceKind,
} from "./backend/types.ts";

const IMPROVE_TASK_MODEL = process.env.CLAUDE_TASK_IMPROVE_MODEL?.trim()
  || "claude-haiku-4-5-20251001";
const PLAN_TASK_MODEL = process.env.CLAUDE_TASK_PLAN_MODEL?.trim()
  || "opus";

type SessionStreamPayload = {
  sessionId: string;
  event: Record<string, unknown>;
};

type SessionResolvedPayload = {
  tempId: string;
  realId: string;
};

type SessionEndedPayload = {
  sessionId: string;
  exitCode: number;
};

type TaskRunBinding = {
  runId: string;
  taskId: string;
  action: TaskAction;
  stagePath: string;
};

let repository: TaskRepository | null = null;
let unsubscribers: Array<() => void> = [];
const taskRunsBySession = new Map<string, TaskRunBinding>();

async function ensureRuntime(ctx: InstrumentBackendContext): Promise<TaskRepository> {
  if (!repository) {
    const store = new TasksStore(ctx.host.storage, "tasks");
    repository = new TaskRepository(store, ctx.host.connectors);
  }
  return repository;
}

function notifyTasksChanged(
  ctx: InstrumentBackendContext,
  stagePath: string,
  taskId: string | null = null
): void {
  if (!stagePath) return;
  ctx.emit({
    event: "tasks.changed",
    payload: {
      stagePath,
      taskId,
    },
  });
}

async function runTaskActionInternal(
  ctx: InstrumentBackendContext,
  taskId: string,
  action: TaskAction
): Promise<{ runId: string; sessionId: string | null }> {
  const repo = await ensureRuntime(ctx);
  const prepared = await repo.prepareTaskRun(taskId, action);
  notifyTasksChanged(ctx, prepared.stagePath, prepared.task.id);

  const session = await ctx.host.sessions.start({
    prompt: prepared.prompt,
    cwd: prepared.stagePath,
    fullAccess: true,
    model: action === "improve"
      ? IMPROVE_TASK_MODEL
      : action === "plan"
        ? PLAN_TASK_MODEL
        : undefined,
    tools: action === "execute" ? undefined : [],
  });

  await repo.bindRunSession(prepared.run.id, session.sessionId);
  taskRunsBySession.set(session.sessionId, {
    runId: prepared.run.id,
    taskId: prepared.task.id,
    action,
    stagePath: prepared.stagePath,
  });
  notifyTasksChanged(ctx, prepared.stagePath, prepared.task.id);

  return {
    runId: prepared.run.id,
    sessionId: action === "execute" ? session.sessionId : null,
  };
}

function extractTaskRunOutput(event: Record<string, unknown>): string {
  if (!event || typeof event !== "object") return "";
  if (event.type === "assistant") {
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
    const blocks = message?.content;
    if (!Array.isArray(blocks)) return "";
    const text = blocks
      .filter((block) => block && typeof block === "object" && block.type === "text")
      .map((block) => String(block.text ?? ""))
      .join("\n")
      .trim();
    return text ? `${text}\n` : "";
  }
  if (event.type === "result") {
    const result = String(event.result ?? "").trim();
    return result ? `${result}\n` : "";
  }
  if (event.type === "error") {
    const error = event.error as { message?: unknown } | undefined;
    const message = String(error?.message ?? "Unknown error").trim();
    return message ? `[error]\n${message}\n` : "";
  }
  return "";
}

async function remapTaskRunSession(tempId: string, realId: string): Promise<void> {
  const run = taskRunsBySession.get(tempId);
  if (!run || !repository) return;
  taskRunsBySession.delete(tempId);
  taskRunsBySession.set(realId, run);
  await repository.bindRunSession(run.runId, realId);
}

async function finalizeTaskRunFromResult(
  ctx: InstrumentBackendContext,
  sessionId: string,
  taskRun: TaskRunBinding,
  event: Record<string, unknown>
): Promise<boolean> {
  if (!repository || !event || event.type !== "result") return false;
  const isSuccess = event.subtype === "success";
  const isFailure = event.subtype === "error";
  if (!isSuccess && !isFailure) return false;

  taskRunsBySession.delete(sessionId);
  const errorPayload = event.error as { message?: unknown } | undefined;
  const output = isSuccess
    ? String(event.result ?? "").trim() || null
    : null;
  const error = isFailure
    ? String(errorPayload?.message ?? event.result ?? "Task action failed").trim() || "Task action failed"
    : null;
  const { task } = await repository.finalizeRun(taskRun.runId, {
    success: isSuccess,
    output,
    error,
  });
  notifyTasksChanged(ctx, task.stagePath, task.id);

  if (taskRun.action !== "execute") {
    void ctx.host.sessions.kill(sessionId).catch(() => {});
  }
  return true;
}

async function finalizeTaskRunFromExit(
  ctx: InstrumentBackendContext,
  sessionId: string,
  exitCode: number
): Promise<void> {
  if (!repository) return;
  const taskRun = taskRunsBySession.get(sessionId);
  if (!taskRun) return;
  taskRunsBySession.delete(sessionId);
  try {
    const { task } = await repository.finalizeRun(taskRun.runId, {
      success: exitCode === 0,
      exitCode,
      error: exitCode === 0 ? null : `Session exited with code ${exitCode}`,
    });
    notifyTasksChanged(ctx, task.stagePath, task.id);
  } catch (err) {
    console.warn("Failed to finalize task run from session end:", err);
  }
}

function installEventHooks(ctx: InstrumentBackendContext): void {
  const unsubSessionResolved = ctx.host.events.subscribe<SessionResolvedPayload>("session.idResolved", ({ tempId, realId }) => {
    void remapTaskRunSession(tempId, realId);
  });
  const unsubSessionStream = ctx.host.events.subscribe<SessionStreamPayload>("session.stream", ({ sessionId, event }) => {
    const taskRun = taskRunsBySession.get(sessionId);
    if (!taskRun || !repository) return;
    if (taskRun.action === "execute") {
      const chunk = extractTaskRunOutput(event);
      if (chunk) {
        void repository.appendRunOutput(taskRun.runId, chunk);
      }
    }
    void finalizeTaskRunFromResult(ctx, sessionId, taskRun, event);
  });
  const unsubSessionEnded = ctx.host.events.subscribe<SessionEndedPayload>("session.ended", ({ sessionId, exitCode }) => {
    void finalizeTaskRunFromExit(ctx, sessionId, exitCode);
  });
  unsubscribers = [unsubSessionResolved, unsubSessionStream, unsubSessionEnded];
}

async function onStart(ctx: InstrumentBackendContext): Promise<void> {
  await ensureRuntime(ctx);
  installEventHooks(ctx);
}

async function onStop(): Promise<void> {
  for (const unsubscribe of unsubscribers) {
    try {
      unsubscribe();
    } catch {
      // no-op
    }
  }
  unsubscribers = [];
  taskRunsBySession.clear();
  if (repository) {
    await repository.close();
    repository = null;
  }
}

async function listStageTasksAction(
  ctx: InstrumentBackendContext,
  input?: { stagePath?: string }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const stagePath = String(input?.stagePath ?? "").trim();
  if (!stagePath) return [];
  return repo.listStageTasks(stagePath);
}

async function getTaskDetailAction(
  ctx: InstrumentBackendContext,
  input?: { taskId?: string }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const taskId = String(input?.taskId ?? "").trim();
  if (!taskId) return null;
  return repo.getTaskDetail(taskId);
}

async function createTaskAction(
  ctx: InstrumentBackendContext,
  input?: { stagePath?: string; title?: string | null; notes?: string | null }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const stagePath = String(input?.stagePath ?? "").trim();
  const title = input?.title == null ? undefined : String(input.title);
  const notes = input?.notes == null ? undefined : String(input.notes);
  if (!stagePath) throw new Error("stagePath is required");
  const task = await repo.createTask(stagePath, title, notes);
  notifyTasksChanged(ctx, task.stagePath, task.id);
  return task;
}

async function updateTaskAction(
  ctx: InstrumentBackendContext,
  input?: { taskId?: string; patch?: Record<string, unknown> }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const taskId = String(input?.taskId ?? "").trim();
  const patch = (input?.patch ?? {}) as Record<string, unknown>;
  if (!taskId) return null;
  const task = await repo.updateTask(taskId, patch);
  if (task) {
    notifyTasksChanged(ctx, task.stagePath, task.id);
  }
  return task;
}

async function deleteTaskAction(
  ctx: InstrumentBackendContext,
  input?: { taskId?: string }
): Promise<{ deleted: boolean }> {
  const repo = await ensureRuntime(ctx);
  const taskId = String(input?.taskId ?? "").trim();
  if (!taskId) return { deleted: false };
  const stagePath = (await repo.getTaskDetail(taskId))?.stagePath ?? null;
  await repo.deleteTask(taskId);
  if (stagePath) {
    notifyTasksChanged(ctx, stagePath, null);
  }
  return { deleted: true };
}

async function addTaskSourceAction(
  ctx: InstrumentBackendContext,
  input?: {
    taskId?: string;
    kind?: string;
    url?: string | null;
    content?: string | null;
  }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const taskId = String(input?.taskId ?? "").trim();
  const kind = String(input?.kind ?? "").trim() as TaskSourceKind;
  const url = input?.url == null ? null : String(input.url);
  const content = input?.content == null ? null : String(input.content);
  if (!taskId) throw new Error("taskId is required");
  let source = await repo.addTaskSource(taskId, kind, url, content);
  if (source.url) {
    const fetched = await repo.fetchTaskSource(source.id);
    if (fetched) source = fetched;
  }
  const task = await repo.getTaskDetail(taskId);
  if (task) {
    notifyTasksChanged(ctx, task.stagePath, task.id);
  }
  return source;
}

async function updateTaskSourceAction(
  ctx: InstrumentBackendContext,
  input?: {
    sourceId?: string;
    patch?: Record<string, unknown>;
  }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const sourceId = String(input?.sourceId ?? "").trim();
  const patch = (input?.patch ?? {}) as Record<string, unknown>;
  if (!sourceId) return null;
  let source = await repo.updateTaskSource(sourceId, patch);
  if (source && patch.url !== undefined && patch.url !== null && String(patch.url).trim()) {
    const fetched = await repo.fetchTaskSource(source.id);
    if (fetched) source = fetched;
  }
  if (source) {
    const task = await repo.getTaskDetail(source.taskId);
    if (task) {
      notifyTasksChanged(ctx, task.stagePath, task.id);
    }
  }
  return source;
}

async function removeTaskSourceAction(
  ctx: InstrumentBackendContext,
  input?: { sourceId?: string }
): Promise<{ removed: boolean }> {
  const repo = await ensureRuntime(ctx);
  const sourceId = String(input?.sourceId ?? "").trim();
  if (!sourceId) return { removed: false };
  const source = await repo.getTaskSource(sourceId);
  await repo.removeTaskSource(sourceId);
  if (source) {
    const task = await repo.getTaskDetail(source.taskId);
    if (task) {
      notifyTasksChanged(ctx, task.stagePath, task.id);
    }
  }
  return { removed: true };
}

async function fetchTaskSourceAction(
  ctx: InstrumentBackendContext,
  input?: { sourceId?: string }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const sourceId = String(input?.sourceId ?? "").trim();
  if (!sourceId) return null;
  const source = await repo.fetchTaskSource(sourceId);
  if (source) {
    const task = await repo.getTaskDetail(source.taskId);
    if (task) {
      notifyTasksChanged(ctx, task.stagePath, task.id);
    }
  }
  return source;
}

async function runTaskActionAction(
  ctx: InstrumentBackendContext,
  input?: { taskId?: string; action?: string }
): Promise<{ runId: string; sessionId: string | null }> {
  const taskId = String(input?.taskId ?? "").trim();
  const action = String(input?.action ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (action !== "improve" && action !== "plan" && action !== "execute") {
    throw new Error(`Unsupported task action '${action}'`);
  }
  return runTaskActionInternal(ctx, taskId, action);
}

async function getTaskRunsAction(
  ctx: InstrumentBackendContext,
  input?: { taskId?: string; limit?: number }
): Promise<unknown> {
  const repo = await ensureRuntime(ctx);
  const taskId = String(input?.taskId ?? "").trim();
  const limit = Number(input?.limit ?? 20);
  return repo.getTaskRuns(taskId, Number.isFinite(limit) ? limit : 20);
}

async function listStageConnectorsAction(
  ctx: InstrumentBackendContext,
  input?: { stagePath?: string }
): Promise<unknown> {
  const stagePath = String(input?.stagePath ?? "").trim();
  if (!stagePath) return [];
  return ctx.host.connectors.listStageConnectors(stagePath);
}

async function startConnectorAuthAction(
  ctx: InstrumentBackendContext,
  input?: { stagePath?: string; provider?: string }
): Promise<unknown> {
  const stagePath = String(input?.stagePath ?? "").trim();
  const provider = String(input?.provider ?? "").trim() as ConnectorProvider;
  return ctx.host.connectors.connect(stagePath, provider);
}

async function disconnectStageConnectorAction(
  ctx: InstrumentBackendContext,
  input?: { stagePath?: string; provider?: string }
): Promise<null> {
  const stagePath = String(input?.stagePath ?? "").trim();
  const provider = String(input?.provider ?? "").trim() as ConnectorProvider;
  await ctx.host.connectors.disconnect(stagePath, provider);
  return null;
}

export default defineBackend({
  kind: "tango.instrument.backend.v2",
  onStart,
  onStop,
  actions: {
    listStageTasks: {
      handler: listStageTasksAction,
    },
    getTaskDetail: {
      handler: getTaskDetailAction,
    },
    createTask: {
      handler: createTaskAction,
    },
    updateTask: {
      handler: updateTaskAction,
    },
    deleteTask: {
      handler: deleteTaskAction,
    },
    addTaskSource: {
      handler: addTaskSourceAction,
    },
    updateTaskSource: {
      handler: updateTaskSourceAction,
    },
    removeTaskSource: {
      handler: removeTaskSourceAction,
    },
    fetchTaskSource: {
      handler: fetchTaskSourceAction,
    },
    runTaskAction: {
      handler: runTaskActionAction,
    },
    getTaskRuns: {
      handler: getTaskRunsAction,
    },
    listStageConnectors: {
      handler: listStageConnectorsAction,
    },
    startConnectorAuth: {
      handler: startConnectorAuthAction,
    },
    disconnectStageConnector: {
      handler: disconnectStageConnectorAction,
    },
  },
});
