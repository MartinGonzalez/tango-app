import { buildTaskActionPrompt } from "./task-prompts.ts";
import { fetchTaskSourceFromUrl, inferSourceKindFromUrl } from "./task-source-fetcher.ts";
import { fetchSlackSourceFromPermalink } from "./slack-source-fetcher.ts";
import { fetchJiraSourceFromUrl, type JiraAuthContext, type JiraSourceFetchResult } from "./jira-source-fetcher.ts";
import { TasksStore } from "./tasks-store.ts";
import type {
  BackendConnectorsAPI,
  TaskAction,
  TaskCardDetail,
  TaskCardStatus,
  TaskCardSummary,
  TaskRun,
  TaskSource,
  TaskSourceKind,
} from "./types.ts";

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
  stagePath: string;
  prompt: string;
};

export class TaskRepository {
  #store: TasksStore;
  #connectors: BackendConnectorsAPI | null;

  constructor(store: TasksStore, connectors: BackendConnectorsAPI | null) {
    this.#store = store;
    this.#connectors = connectors;
  }

  async close(): Promise<void> {
    await this.#store.close();
  }

  async listStageTasks(stagePath: string): Promise<TaskCardSummary[]> {
    return this.#store.listStageTasks(stagePath);
  }

  async getTaskDetail(taskId: string): Promise<TaskCardDetail | null> {
    return this.#store.getTaskDetail(taskId);
  }

  async createTask(stagePath: string, title?: string, notes?: string): Promise<TaskCardDetail> {
    const safeTitle = collapseWhitespace(title ?? "") || "Untitled task";
    const safeNotes = String(notes ?? "");
    return this.#store.createTask(stagePath, safeTitle, safeNotes);
  }

  async updateTask(taskId: string, patch: UpdateTaskPatch): Promise<TaskCardDetail | null> {
    const current = await this.#store.getTaskDetail(taskId);
    if (!current) return null;

    const notesChanged = patch.notes !== undefined && patch.notes !== current.notes;
    if (notesChanged) {
      await this.#invalidatePlanIfNeeded(current);
    }

    return this.#store.updateTask(taskId, {
      title: patch.title,
      notesMd: patch.notes,
      status: patch.status,
      planMd: patch.planMarkdown,
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.#store.deleteTask(taskId);
  }

  async addTaskSource(
    taskId: string,
    kind: TaskSourceKind,
    url: string | null,
    content: string | null
  ): Promise<TaskSource> {
    const current = await this.#store.getTaskDetail(taskId);
    if (!current) {
      throw new Error(`Task not found: ${taskId}`);
    }

    await this.#invalidatePlanIfNeeded(current);
    const normalizedKind = normalizeSourceKind(kind, url);
    return this.#store.addTaskSource(taskId, normalizedKind, url, content);
  }

  async updateTaskSource(sourceId: string, patch: UpdateTaskSourcePatch): Promise<TaskSource | null> {
    const taskId = await this.#store.getTaskSourceTaskId(sourceId);
    if (!taskId) return null;

    const task = await this.#store.getTaskDetail(taskId);
    if (!task) return null;

    const source = await this.#store.getTaskSource(sourceId);
    if (!source) return null;

    const urlChanged = patch.url !== undefined && patch.url !== source.url;
    const contentChanged = patch.content !== undefined && patch.content !== source.content;
    const titleChanged = patch.title !== undefined && patch.title !== source.title;
    const changed = urlChanged || contentChanged || titleChanged;

    if (changed) {
      await this.#invalidatePlanIfNeeded(task);
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

  async removeTaskSource(sourceId: string): Promise<void> {
    const taskId = await this.#store.getTaskSourceTaskId(sourceId);
    if (taskId) {
      const task = await this.#store.getTaskDetail(taskId);
      if (task) await this.#invalidatePlanIfNeeded(task);
    }
    await this.#store.removeTaskSource(sourceId);
  }

  async fetchTaskSource(sourceId: string): Promise<TaskSource | null> {
    const source = await this.#store.getTaskSource(sourceId);
    if (!source) return null;

    const task = await this.#store.getTaskDetail(source.taskId);
    if (!task) return null;

    await this.#invalidatePlanIfNeeded(task);

    if (!source.url) {
      return this.#store.updateTaskSource(sourceId, {
        fetchStatus: "network_error",
        fetchHttpStatus: null,
        fetchError: "Source has no URL",
        fetchedAt: null,
      });
    }

    if (source.kind === "slack") {
      if (!this.#connectors) {
        return this.#store.updateTaskSource(sourceId, {
          fetchStatus: "network_error",
          fetchHttpStatus: null,
          fetchError: "Connect Slack in Connectors to fetch this source",
          fetchedAt: null,
        });
      }

      let accessToken: string;
      try {
        const credential = await this.#connectors.getCredential(task.stagePath, "slack");
        accessToken = credential.accessToken;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return this.#store.updateTaskSource(sourceId, {
          fetchStatus: "network_error",
          fetchHttpStatus: null,
          fetchError: message || "Connect Slack in Connectors to fetch this source",
          fetchedAt: null,
        });
      }

      const slackResult = await fetchSlackSourceFromPermalink(source.url, accessToken, {
        messageLimit: 30,
      });
      return this.#store.updateTaskSource(sourceId, {
        kind: slackResult.kind,
        sourceTitle: slackResult.title,
        contentText: slackResult.content,
        fetchStatus: slackResult.fetchStatus,
        fetchHttpStatus: slackResult.httpStatus,
        fetchError: slackResult.error,
        fetchedAt: slackResult.fetchedAt,
      });
    }

    if (source.kind === "jira") {
      if (!this.#connectors) {
        return this.#store.updateTaskSource(sourceId, {
          fetchStatus: "network_error",
          fetchHttpStatus: null,
          fetchError: "Connect Jira in Connectors to fetch this source",
          fetchedAt: null,
        });
      }

      let jiraAuth: JiraAuthContext;
      try {
        const credential = await this.#connectors.getCredential(task.stagePath, "jira");
        const cloudId = String(credential.metadata?.cloudId ?? "").trim();
        if (!cloudId) {
          throw new Error("Connect Jira in Connectors to fetch this source");
        }
        jiraAuth = {
          accessToken: credential.accessToken,
          cloudId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return this.#store.updateTaskSource(sourceId, {
          fetchStatus: "network_error",
          fetchHttpStatus: null,
          fetchError: message || "Connect Jira in Connectors to fetch this source",
          fetchedAt: null,
        });
      }

      const jiraResult: JiraSourceFetchResult = await fetchJiraSourceFromUrl(
        source.url,
        jiraAuth,
        {
          commentLimit: 30,
        }
      );

      return this.#store.updateTaskSource(sourceId, {
        kind: jiraResult.kind,
        sourceTitle: jiraResult.title,
        contentText: jiraResult.content,
        fetchStatus: jiraResult.fetchStatus,
        fetchHttpStatus: jiraResult.httpStatus,
        fetchError: jiraResult.error,
        fetchedAt: jiraResult.fetchedAt,
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

  async getTaskRuns(taskId: string, limit = 20): Promise<TaskRun[]> {
    return this.#store.getTaskRuns(taskId, limit);
  }

  async getTaskSource(sourceId: string): Promise<TaskSource | null> {
    return this.#store.getTaskSource(sourceId);
  }

  async prepareTaskRun(taskId: string, action: TaskAction): Promise<PreparedTaskRun> {
    const task = await this.#store.getTaskDetail(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === "running" || task.status === "in_progress") {
      const runningExecute = await this.#store.findRunningRun(taskId, "execute");
      if (runningExecute && !isStaleBackgroundRun(runningExecute.startedAt)) {
        throw new Error("Task is already running");
      }

      const now = new Date().toISOString();
      if (runningExecute) {
        await this.#store.updateTaskRun(runningExecute.id, {
          status: "failed",
          errorText: "Auto-canceled stale execute run",
          endedAt: now,
        });
      }
      await this.#store.updateTask(task.id, {
        status: "blocked_by",
      });
    }

    const existing = await this.#store.findRunningRun(taskId, action);
    if (existing) {
      if (action !== "execute" && isStaleBackgroundRun(existing.startedAt)) {
        await this.#store.updateTaskRun(existing.id, {
          status: "failed",
          errorText: "Auto-canceled stale background run",
          endedAt: new Date().toISOString(),
        });
      } else {
        throw new Error(`Action '${action}' is already running for this task`);
      }
    }

    const stillRunning = await this.#store.findRunningRun(taskId, action);
    if (stillRunning) {
      throw new Error(`Action '${action}' is already running for this task`);
    }

    const prompt = buildTaskActionPrompt(task, action);
    const run = await this.#store.createTaskRun(task.id, action, prompt, "running", null);

    if (action === "execute") {
      await this.#store.updateTask(task.id, {
        status: "in_progress",
        lastAction: action,
        lastActionSessionId: null,
      });
    } else {
      await this.#store.updateTask(task.id, {
        lastAction: action,
        lastActionSessionId: null,
      });
    }

    const updated = await this.#store.getTaskDetail(task.id);
    if (!updated) {
      throw new Error(`Task not found after starting run: ${task.id}`);
    }

    return {
      run,
      task: updated,
      stagePath: task.stagePath,
      prompt,
    };
  }

  async bindRunSession(runId: string, sessionId: string): Promise<TaskRun | null> {
    const run = await this.#store.updateTaskRun(runId, { sessionId });
    if (!run) return null;

    await this.#store.updateTask(run.taskId, {
      lastActionSessionId: sessionId,
    });
    return run;
  }

  async appendRunOutput(runId: string, chunk: string): Promise<TaskRun | null> {
    return this.#store.appendTaskRunOutput(runId, chunk);
  }

  async getRun(runId: string): Promise<TaskRun | null> {
    return this.#store.getTaskRun(runId);
  }

  async getRunBySessionId(sessionId: string): Promise<TaskRun | null> {
    return this.#store.getTaskRunBySessionId(sessionId);
  }

  async listHiddenSessionIds(): Promise<string[]> {
    return this.#store.listHiddenTaskSessionIds();
  }

  async finalizeRun(runId: string, params: {
    success: boolean;
    output?: string | null;
    error?: string | null;
    exitCode?: number;
  }): Promise<{ run: TaskRun; task: TaskCardDetail }> {
    const run = await this.#store.getTaskRun(runId);
    if (!run) {
      throw new Error(`Task run not found: ${runId}`);
    }

    const now = new Date().toISOString();
    const mergedOutput = mergeOutput(run.output, params.output ?? null);

    const finalRun = await this.#store.updateTaskRun(run.id, {
      status: params.success ? "completed" : "failed",
      outputText: mergedOutput,
      errorText: params.error ?? run.error,
      endedAt: now,
    });

    if (!finalRun) {
      throw new Error(`Task run not found after update: ${run.id}`);
    }

    const task = await this.#store.getTaskDetail(finalRun.taskId);
    if (!task) {
      throw new Error(`Task not found: ${finalRun.taskId}`);
    }

    if (finalRun.action === "improve") {
      await this.#finalizeImprove(task, finalRun, params.success, mergedOutput);
    } else if (finalRun.action === "plan") {
      await this.#finalizePlan(task, finalRun, params.success, mergedOutput, now);
    } else {
      await this.#finalizeExecute(task, finalRun, params.success, now);
    }

    const nextTask = await this.#store.getTaskDetail(task.id);
    if (!nextTask) {
      throw new Error(`Task not found after finalizing run: ${task.id}`);
    }

    return {
      run: finalRun,
      task: nextTask,
    };
  }

  async #finalizeImprove(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    mergedOutput: string | null
  ): Promise<void> {
    if (!success || !hasText(mergedOutput)) {
      return;
    }

    await this.#store.updateTask(task.id, {
      status: task.status,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });
    await this.#store.createArtifact(task.id, run.id, "improved_notes", mergedOutput ?? "");
  }

  async #finalizePlan(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    mergedOutput: string | null,
    now: string
  ): Promise<void> {
    if (!success || !hasText(mergedOutput)) {
      return;
    }

    await this.#store.updateTask(task.id, {
      planMd: mergedOutput,
      status: "todo",
      plannedAt: now,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });
    await this.#store.createArtifact(task.id, run.id, "plan", mergedOutput ?? "");
  }

  async #finalizeExecute(
    task: TaskCardDetail,
    run: TaskRun,
    success: boolean,
    now: string
  ): Promise<void> {
    await this.#store.updateTask(task.id, {
      status: success ? "in_progress" : "blocked_by",
      executedAt: null,
      lastAction: run.action,
      lastActionSessionId: run.sessionId,
    });

    const executionContext = [
      `run=${run.id}`,
      `status=${success ? "in_progress" : "blocked_by"}`,
      `startedAt=${run.startedAt}`,
      `endedAt=${run.endedAt ?? now}`,
    ].join("\n");
    await this.#store.createArtifact(task.id, run.id, "execution_context", executionContext);
  }

  async #invalidatePlanIfNeeded(task: TaskCardDetail): Promise<void> {
    if (!hasText(task.planMarkdown)) return;

    await this.#store.createArtifact(task.id, null, "plan", task.planMarkdown ?? "");
    await this.#store.updateTask(task.id, {
      planMd: null,
      status: "todo",
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
