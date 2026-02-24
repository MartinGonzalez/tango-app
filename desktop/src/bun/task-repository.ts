import type {
  TaskAction,
  TaskCardDetail,
  TaskCardStatus,
  TaskCardSummary,
  TaskRun,
  TaskSource,
  TaskSourceKind,
} from "../shared/types.ts";
import { buildTaskActionPrompt } from "./task-prompts.ts";
import { fetchTaskSourceFromUrl, inferSourceKindFromUrl } from "./task-source-fetcher.ts";
import { TasksStore } from "./tasks-store.ts";

type UpdateTaskPatch = {
  title?: string;
  notes?: string;
  status?: TaskCardStatus;
  planMarkdown?: string | null;
};

type UpdateTaskSourcePatch = {
  title?: string | null;
  content?: string | null;
  url?: string | null;
};

export type PreparedTaskRun = {
  run: TaskRun;
  task: TaskCardDetail;
  workspacePath: string;
  prompt: string;
};

export class TaskRepository {
  #store: TasksStore;

  constructor(store?: TasksStore) {
    this.#store = store ?? new TasksStore();
  }

  close(): void {
    this.#store.close();
  }

  listWorkspaceTasks(workspacePath: string): TaskCardSummary[] {
    return this.#store.listWorkspaceTasks(workspacePath);
  }

  getTaskDetail(taskId: string): TaskCardDetail | null {
    return this.#store.getTaskDetail(taskId);
  }

  createTask(workspacePath: string, title?: string, notes?: string): TaskCardDetail {
    const safeTitle = collapseWhitespace(title ?? "") || "Untitled task";
    const safeNotes = String(notes ?? "");
    return this.#store.createTask(workspacePath, safeTitle, safeNotes);
  }

  updateTask(taskId: string, patch: UpdateTaskPatch): TaskCardDetail | null {
    const current = this.#store.getTaskDetail(taskId);
    if (!current) return null;

    const notesChanged = patch.notes !== undefined && patch.notes !== current.notes;
    if (notesChanged) {
      this.#invalidatePlanIfNeeded(current);
    }

    return this.#store.updateTask(taskId, {
      title: patch.title,
      notesMd: patch.notes,
      status: patch.status,
      planMd: patch.planMarkdown,
    });
  }

  deleteTask(taskId: string): void {
    this.#store.deleteTask(taskId);
  }

  addTaskSource(
    taskId: string,
    kind: TaskSourceKind,
    url: string | null,
    content: string | null
  ): TaskSource {
    const current = this.#store.getTaskDetail(taskId);
    if (!current) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.#invalidatePlanIfNeeded(current);
    const normalizedKind = normalizeSourceKind(kind, url);
    return this.#store.addTaskSource(taskId, normalizedKind, url, content);
  }

  updateTaskSource(sourceId: string, patch: UpdateTaskSourcePatch): TaskSource | null {
    const taskId = this.#store.getTaskSourceTaskId(sourceId);
    if (!taskId) return null;

    const task = this.#store.getTaskDetail(taskId);
    if (!task) return null;

    const source = this.#store.getTaskSource(sourceId);
    if (!source) return null;

    const urlChanged = patch.url !== undefined && patch.url !== source.url;
    const contentChanged = patch.content !== undefined && patch.content !== source.content;
    const titleChanged = patch.title !== undefined && patch.title !== source.title;
    const changed = urlChanged || contentChanged || titleChanged;

    if (changed) {
      this.#invalidatePlanIfNeeded(task);
    }

    const nextKind = urlChanged
      ? normalizeSourceKind(source.kind, patch.url)
      : source.kind;

    return this.#store.updateTaskSource(sourceId, {
      kind: nextKind,
      url: patch.url,
      sourceTitle: patch.title,
      contentText: patch.content,
    });
  }

  removeTaskSource(sourceId: string): void {
    const taskId = this.#store.getTaskSourceTaskId(sourceId);
    if (taskId) {
      const task = this.#store.getTaskDetail(taskId);
      if (task) this.#invalidatePlanIfNeeded(task);
    }
    this.#store.removeTaskSource(sourceId);
  }

  async fetchTaskSource(sourceId: string): Promise<TaskSource | null> {
    const source = this.#store.getTaskSource(sourceId);
    if (!source) return null;

    const task = this.#store.getTaskDetail(source.taskId);
    if (!task) return null;

    this.#invalidatePlanIfNeeded(task);

    if (!source.url) {
      return this.#store.updateTaskSource(sourceId, {
        fetchStatus: "network_error",
        fetchHttpStatus: null,
        fetchError: "Source has no URL",
        fetchedAt: null,
      });
    }

    const result = await fetchTaskSourceFromUrl(source.url);
    return this.#store.updateTaskSource(sourceId, {
      kind: result.kind,
      sourceTitle: result.title,
      contentText: result.content,
      fetchStatus: result.fetchStatus,
      fetchHttpStatus: result.httpStatus,
      fetchError: result.error,
      fetchedAt: result.fetchedAt,
    });
  }

  getTaskRuns(taskId: string, limit = 20): TaskRun[] {
    return this.#store.getTaskRuns(taskId, limit);
  }

  getTaskSource(sourceId: string): TaskSource | null {
    return this.#store.getTaskSource(sourceId);
  }

  prepareTaskRun(taskId: string, action: TaskAction): PreparedTaskRun {
    const task = this.#store.getTaskDetail(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === "running") {
      const runningExecute = this.#store.findRunningRun(taskId, "execute");
      if (runningExecute && !isStaleBackgroundRun(runningExecute.startedAt)) {
        throw new Error("Task is already running");
      }

      const now = new Date().toISOString();
      if (runningExecute) {
        this.#store.updateTaskRun(runningExecute.id, {
          status: "failed",
          errorText: "Auto-canceled stale execute run",
          endedAt: now,
        });
      }
      this.#store.updateTask(task.id, {
        status: "blocked",
      });
    }

    const existing = this.#store.findRunningRun(taskId, action);
    if (existing) {
      if (action !== "execute" && isStaleBackgroundRun(existing.startedAt)) {
        this.#store.updateTaskRun(existing.id, {
          status: "failed",
          errorText: "Auto-canceled stale background run",
          endedAt: new Date().toISOString(),
        });
      } else {
        throw new Error(`Action '${action}' is already running for this task`);
      }
    }

    const stillRunning = this.#store.findRunningRun(taskId, action);
    if (stillRunning) {
      throw new Error(`Action '${action}' is already running for this task`);
    }

    const prompt = buildTaskActionPrompt(task, action);
    const run = this.#store.createTaskRun(task.id, action, prompt, "running", null);

    if (action === "execute") {
      this.#store.updateTask(task.id, {
        status: "running",
        lastAction: action,
        lastActionSessionId: null,
      });
    } else {
      this.#store.updateTask(task.id, {
        lastAction: action,
        lastActionSessionId: null,
      });
    }

    const updated = this.#store.getTaskDetail(task.id);
    if (!updated) {
      throw new Error(`Task not found after starting run: ${task.id}`);
    }

    return {
      run,
      task: updated,
      workspacePath: task.workspacePath,
      prompt,
    };
  }

  bindRunSession(runId: string, sessionId: string): TaskRun | null {
    const run = this.#store.updateTaskRun(runId, { sessionId });
    if (!run) return null;

    this.#store.updateTask(run.taskId, {
      lastActionSessionId: sessionId,
    });
    return run;
  }

  appendRunOutput(runId: string, chunk: string): TaskRun | null {
    return this.#store.appendTaskRunOutput(runId, chunk);
  }

  getRun(runId: string): TaskRun | null {
    return this.#store.getTaskRun(runId);
  }

  getRunBySessionId(sessionId: string): TaskRun | null {
    return this.#store.getTaskRunBySessionId(sessionId);
  }

  finalizeRun(runId: string, params: {
    success: boolean;
    output?: string | null;
    error?: string | null;
    exitCode?: number;
  }): { run: TaskRun; task: TaskCardDetail } {
    const run = this.#store.getTaskRun(runId);
    if (!run) {
      throw new Error(`Task run not found: ${runId}`);
    }

    const now = new Date().toISOString();
    const mergedOutput = mergeOutput(run.output, params.output ?? null);

    const finalRun = this.#store.updateTaskRun(run.id, {
      status: params.success ? "completed" : "failed",
      outputText: mergedOutput,
      errorText: params.error ?? run.error,
      endedAt: now,
    });

    if (!finalRun) {
      throw new Error(`Task run not found after update: ${run.id}`);
    }

    const task = this.#store.getTaskDetail(finalRun.taskId);
    if (!task) {
      throw new Error(`Task not found: ${finalRun.taskId}`);
    }

    if (finalRun.action === "improve") {
      this.#finalizeImprove(task, finalRun, params.success, mergedOutput);
    } else if (finalRun.action === "plan") {
      this.#finalizePlan(task, finalRun, params.success, mergedOutput, now);
    } else {
      this.#finalizeExecute(task, finalRun, params.success, now);
    }

    const nextTask = this.#store.getTaskDetail(task.id);
    if (!nextTask) {
      throw new Error(`Task not found after finalizing run: ${task.id}`);
    }

    return {
      run: finalRun,
      task: nextTask,
    };
  }

  #finalizeImprove(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    mergedOutput: string | null
  ): void {
    if (!success || !hasText(mergedOutput)) {
      return;
    }

    this.#store.updateTask(task.id, {
      status: task.status,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });
    this.#store.createArtifact(task.id, run.id, "improved_notes", mergedOutput ?? "");
  }

  #finalizePlan(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    mergedOutput: string | null,
    now: string
  ): void {
    if (!success || !hasText(mergedOutput)) {
      return;
    }

    this.#store.updateTask(task.id, {
      planMd: mergedOutput,
      status: "planned",
      plannedAt: now,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });
    this.#store.createArtifact(task.id, run.id, "plan", mergedOutput ?? "");
  }

  #finalizeExecute(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    now: string
  ): void {
    this.#store.updateTask(task.id, {
      status: success ? "done" : "blocked",
      executedAt: success ? now : null,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });

    const executionContext = [
      `run=${run.id}`,
      `status=${success ? "done" : "blocked"}`,
      `startedAt=${run.startedAt}`,
      `endedAt=${run.endedAt ?? now}`,
    ].join("\n");
    this.#store.createArtifact(task.id, run.id, "execution_context", executionContext);
  }

  #invalidatePlanIfNeeded(task: TaskCardDetail): void {
    if (!hasText(task.planMarkdown)) return;

    this.#store.createArtifact(task.id, null, "plan", task.planMarkdown ?? "");
    this.#store.updateTask(task.id, {
      planMd: null,
      status: "draft",
      plannedAt: null,
    });
  }
}

function normalizeSourceKind(currentKind: TaskSourceKind, url: string | null | undefined): TaskSourceKind {
  if (!url) return currentKind;
  return inferSourceKindFromUrl(url);
}

function hasText(value: string | null | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function mergeOutput(base: string | null, extra: string | null): string | null {
  const head = String(base ?? "");
  const tail = String(extra ?? "");
  if (!head && !tail) return null;
  if (!tail) return head;
  if (!head) return tail;
  if (head.includes(tail)) return head;
  return `${head}\n\n${tail}`;
}

function isStaleBackgroundRun(startedAtIso: string): boolean {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return true;
  const ageMs = Date.now() - started;
  return ageMs > 2 * 60_000;
}
