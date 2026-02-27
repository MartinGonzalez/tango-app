import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";
import type {
  TaskAction,
  TaskCardDetail,
  TaskCardStatus,
  TaskCardSummary,
  TaskRun,
  TaskRunStatus,
  TaskSource,
  TaskSourceFetchStatus,
  TaskSourceKind,
} from "../shared/types.ts";

const DEFAULT_DB_PATH = join(homedir(), ".tango", "tasks.db");
const CURRENT_SCHEMA_VERSION = 1;

type TaskUpdateFields = {
  title?: string;
  notesMd?: string;
  planMd?: string | null;
  status?: TaskCardStatus;
  plannedAt?: string | null;
  executedAt?: string | null;
  lastAction?: TaskAction | null;
  lastActionSessionId?: string | null;
};

type TaskSourceUpdateFields = {
  kind?: TaskSourceKind;
  url?: string | null;
  sourceTitle?: string | null;
  sourceMetaJson?: string;
  contentText?: string | null;
  fetchStatus?: TaskSourceFetchStatus;
  fetchHttpStatus?: number | null;
  fetchError?: string | null;
  fetchedAt?: string | null;
};

type TaskRunUpdateFields = {
  status?: TaskRunStatus;
  sessionId?: string | null;
  outputText?: string | null;
  errorText?: string | null;
  endedAt?: string | null;
};

type TaskRow = {
  id: string;
  stage_path: string;
  title: string;
  notes_md: string;
  plan_md: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type TaskSourceRow = {
  id: string;
  task_id: string;
  kind: string;
  url: string | null;
  source_title: string | null;
  content_text: string | null;
  fetch_status: string;
  fetch_http_status: number | null;
  fetch_error: string | null;
  fetched_at: string | null;
  updated_at: string;
};

type TaskRunRow = {
  id: string;
  task_id: string;
  action: string;
  status: string;
  session_id: string | null;
  started_at: string;
  ended_at: string | null;
  output_text: string | null;
  error_text: string | null;
};

export class TasksStore {
  #db: Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.#db = new Database(dbPath, { create: true, strict: true });
    this.#db.exec("PRAGMA foreign_keys = ON;");
    this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#migrate();
  }

  close(): void {
    this.#db.close(false);
  }

  listStageTasks(stagePath: string): TaskCardSummary[] {
    const rows = this.#db.query(
      `
      SELECT
        id,
        stage_path,
        title,
        status,
        updated_at,
        CASE
          WHEN plan_md IS NULL THEN 0
          WHEN trim(plan_md) = '' THEN 0
          ELSE 1
        END AS has_plan
      FROM tasks
      WHERE stage_path = ?
      ORDER BY updated_at DESC
      `
    ).all(stagePath) as Array<{
      id: string;
      stage_path: string;
      title: string;
      status: string;
      updated_at: string;
      has_plan: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      stagePath: row.stage_path,
      title: row.title,
      status: normalizeTaskStatus(row.status),
      updatedAt: row.updated_at,
      hasPlan: row.has_plan > 0,
    }));
  }

  getTaskDetail(taskId: string): TaskCardDetail | null {
    const taskRow = this.#db.query(
      `
      SELECT
        id,
        stage_path,
        title,
        notes_md,
        plan_md,
        status,
        created_at,
        updated_at
      FROM tasks
      WHERE id = ?
      `
    ).get(taskId) as TaskRow | null;

    if (!taskRow) return null;

    const sourceRows = this.#db.query(
      `
      SELECT
        id,
        task_id,
        kind,
        url,
        source_title,
        content_text,
        fetch_status,
        fetch_http_status,
        fetch_error,
        fetched_at,
        updated_at
      FROM task_sources
      WHERE task_id = ?
      ORDER BY updated_at DESC
      `
    ).all(taskId) as TaskSourceRow[];

    const runRow = this.#db.query(
      `
      SELECT
        id,
        task_id,
        action,
        status,
        session_id,
        started_at,
        ended_at,
        output_text,
        error_text
      FROM task_runs
      WHERE task_id = ?
      ORDER BY started_at DESC
      LIMIT 1
      `
    ).get(taskId) as TaskRunRow | null;

    return {
      id: taskRow.id,
      stagePath: taskRow.stage_path,
      title: taskRow.title,
      notes: taskRow.notes_md,
      planMarkdown: taskRow.plan_md,
      status: normalizeTaskStatus(taskRow.status),
      sources: sourceRows.map(mapSourceRow),
      lastRun: runRow ? mapRunRow(runRow) : null,
      createdAt: taskRow.created_at,
      updatedAt: taskRow.updated_at,
    };
  }

  getTaskStagePath(taskId: string): string | null {
    const row = this.#db.query("SELECT stage_path FROM tasks WHERE id = ?").get(taskId) as {
      stage_path: string;
    } | null;
    return row?.stage_path ?? null;
  }

  createTask(
    stagePath: string,
    title: string,
    notesMd: string
  ): TaskCardDetail {
    const id = crypto.randomUUID();
    const now = isoNow();

    this.#db.query(
      `
      INSERT INTO tasks (
        id,
        stage_path,
        title,
        notes_md,
        plan_md,
        status,
        created_at,
        updated_at,
        planned_at,
        executed_at,
        last_action,
        last_action_session_id,
        version
      ) VALUES (?, ?, ?, ?, NULL, 'todo', ?, ?, NULL, NULL, NULL, NULL, 1)
      `
    ).run(id, stagePath, title, notesMd, now, now);

    const detail = this.getTaskDetail(id);
    if (!detail) {
      throw new Error("Failed to create task");
    }
    return detail;
  }

  updateTask(taskId: string, fields: TaskUpdateFields): TaskCardDetail | null {
    const current = this.#db.query("SELECT id FROM tasks WHERE id = ?").get(taskId) as {
      id: string;
    } | null;
    if (!current) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (fields.title !== undefined) {
      updates.push("title = ?");
      values.push(fields.title);
    }
    if (fields.notesMd !== undefined) {
      updates.push("notes_md = ?");
      values.push(fields.notesMd);
    }
    if (fields.planMd !== undefined) {
      updates.push("plan_md = ?");
      values.push(fields.planMd);
    }
    if (fields.status !== undefined) {
      updates.push("status = ?");
      values.push(fields.status);
    }
    if (fields.plannedAt !== undefined) {
      updates.push("planned_at = ?");
      values.push(fields.plannedAt);
    }
    if (fields.executedAt !== undefined) {
      updates.push("executed_at = ?");
      values.push(fields.executedAt);
    }
    if (fields.lastAction !== undefined) {
      updates.push("last_action = ?");
      values.push(fields.lastAction);
    }
    if (fields.lastActionSessionId !== undefined) {
      updates.push("last_action_session_id = ?");
      values.push(fields.lastActionSessionId);
    }

    updates.push("updated_at = ?");
    values.push(isoNow());
    values.push(taskId);

    this.#db.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getTaskDetail(taskId);
  }

  deleteTask(taskId: string): void {
    this.#db.query("DELETE FROM tasks WHERE id = ?").run(taskId);
  }

  addTaskSource(
    taskId: string,
    kind: TaskSourceKind,
    url: string | null,
    contentText: string | null
  ): TaskSource {
    const sourceId = crypto.randomUUID();
    const now = isoNow();

    this.#db.query(
      `
      INSERT INTO task_sources (
        id,
        task_id,
        kind,
        url,
        source_title,
        source_meta_json,
        content_text,
        fetch_status,
        fetch_http_status,
        fetch_error,
        fetched_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, NULL, '{}', ?, 'idle', NULL, NULL, NULL, ?, ?)
      `
    ).run(sourceId, taskId, kind, url, contentText, now, now);

    return this.#getTaskSourceOrThrow(sourceId);
  }

  getTaskSource(sourceId: string): TaskSource | null {
    const row = this.#db.query(
      `
      SELECT
        id,
        task_id,
        kind,
        url,
        source_title,
        content_text,
        fetch_status,
        fetch_http_status,
        fetch_error,
        fetched_at,
        updated_at
      FROM task_sources
      WHERE id = ?
      `
    ).get(sourceId) as TaskSourceRow | null;

    return row ? mapSourceRow(row) : null;
  }

  getTaskSourceTaskId(sourceId: string): string | null {
    const row = this.#db.query("SELECT task_id FROM task_sources WHERE id = ?").get(sourceId) as {
      task_id: string;
    } | null;
    return row?.task_id ?? null;
  }

  updateTaskSource(sourceId: string, fields: TaskSourceUpdateFields): TaskSource | null {
    const current = this.#db.query("SELECT id FROM task_sources WHERE id = ?").get(sourceId) as {
      id: string;
    } | null;
    if (!current) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (fields.kind !== undefined) {
      updates.push("kind = ?");
      values.push(fields.kind);
    }
    if (fields.url !== undefined) {
      updates.push("url = ?");
      values.push(fields.url);
    }
    if (fields.sourceTitle !== undefined) {
      updates.push("source_title = ?");
      values.push(fields.sourceTitle);
    }
    if (fields.sourceMetaJson !== undefined) {
      updates.push("source_meta_json = ?");
      values.push(fields.sourceMetaJson);
    }
    if (fields.contentText !== undefined) {
      updates.push("content_text = ?");
      values.push(fields.contentText);
    }
    if (fields.fetchStatus !== undefined) {
      updates.push("fetch_status = ?");
      values.push(fields.fetchStatus);
    }
    if (fields.fetchHttpStatus !== undefined) {
      updates.push("fetch_http_status = ?");
      values.push(fields.fetchHttpStatus);
    }
    if (fields.fetchError !== undefined) {
      updates.push("fetch_error = ?");
      values.push(fields.fetchError);
    }
    if (fields.fetchedAt !== undefined) {
      updates.push("fetched_at = ?");
      values.push(fields.fetchedAt);
    }

    updates.push("updated_at = ?");
    values.push(isoNow());
    values.push(sourceId);

    this.#db.query(`UPDATE task_sources SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getTaskSource(sourceId);
  }

  removeTaskSource(sourceId: string): void {
    this.#db.query("DELETE FROM task_sources WHERE id = ?").run(sourceId);
  }

  getTaskRuns(taskId: string, limit: number = 20): TaskRun[] {
    const rows = this.#db.query(
      `
      SELECT
        id,
        task_id,
        action,
        status,
        session_id,
        started_at,
        ended_at,
        output_text,
        error_text
      FROM task_runs
      WHERE task_id = ?
      ORDER BY started_at DESC
      LIMIT ?
      `
    ).all(taskId, Math.max(1, limit)) as TaskRunRow[];

    return rows.map(mapRunRow);
  }

  getTaskRun(runId: string): TaskRun | null {
    const row = this.#db.query(
      `
      SELECT
        id,
        task_id,
        action,
        status,
        session_id,
        started_at,
        ended_at,
        output_text,
        error_text
      FROM task_runs
      WHERE id = ?
      `
    ).get(runId) as TaskRunRow | null;

    return row ? mapRunRow(row) : null;
  }

  findRunningRun(taskId: string, action: TaskAction): TaskRun | null {
    const row = this.#db.query(
      `
      SELECT
        id,
        task_id,
        action,
        status,
        session_id,
        started_at,
        ended_at,
        output_text,
        error_text
      FROM task_runs
      WHERE task_id = ?
        AND action = ?
        AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
      `
    ).get(taskId, action) as TaskRunRow | null;

    return row ? mapRunRow(row) : null;
  }

  createTaskRun(
    taskId: string,
    action: TaskAction,
    promptSnapshot: string,
    status: TaskRunStatus = "running",
    sessionId: string | null = null
  ): TaskRun {
    const runId = crypto.randomUUID();
    const now = isoNow();

    this.#db.query(
      `
      INSERT INTO task_runs (
        id,
        task_id,
        action,
        session_id,
        status,
        prompt_snapshot,
        output_text,
        error_text,
        started_at,
        ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)
      `
    ).run(runId, taskId, action, sessionId, status, promptSnapshot, now);

    const run = this.getTaskRun(runId);
    if (!run) throw new Error("Failed to create task run");
    return run;
  }

  updateTaskRun(runId: string, fields: TaskRunUpdateFields): TaskRun | null {
    const current = this.#db.query("SELECT id FROM task_runs WHERE id = ?").get(runId) as {
      id: string;
    } | null;
    if (!current) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (fields.status !== undefined) {
      updates.push("status = ?");
      values.push(fields.status);
    }
    if (fields.sessionId !== undefined) {
      updates.push("session_id = ?");
      values.push(fields.sessionId);
    }
    if (fields.outputText !== undefined) {
      updates.push("output_text = ?");
      values.push(fields.outputText);
    }
    if (fields.errorText !== undefined) {
      updates.push("error_text = ?");
      values.push(fields.errorText);
    }
    if (fields.endedAt !== undefined) {
      updates.push("ended_at = ?");
      values.push(fields.endedAt);
    }

    values.push(runId);

    this.#db.query(`UPDATE task_runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getTaskRun(runId);
  }

  appendTaskRunOutput(runId: string, chunk: string): TaskRun | null {
    if (!chunk) return this.getTaskRun(runId);

    const row = this.#db.query("SELECT output_text FROM task_runs WHERE id = ?").get(runId) as {
      output_text: string | null;
    } | null;
    if (!row) return null;

    const next = `${row.output_text ?? ""}${chunk}`;
    return this.updateTaskRun(runId, { outputText: next });
  }

  getTaskRunBySessionId(sessionId: string): TaskRun | null {
    const row = this.#db.query(
      `
      SELECT
        id,
        task_id,
        action,
        status,
        session_id,
        started_at,
        ended_at,
        output_text,
        error_text
      FROM task_runs
      WHERE session_id = ?
      ORDER BY started_at DESC
      LIMIT 1
      `
    ).get(sessionId) as TaskRunRow | null;

    return row ? mapRunRow(row) : null;
  }

  listHiddenTaskSessionIds(): string[] {
    const rows = this.#db.query(
      `
      SELECT DISTINCT session_id
      FROM task_runs
      WHERE session_id IS NOT NULL
        AND trim(session_id) <> ''
        AND action IN ('improve', 'plan')
      `
    ).all() as Array<{ session_id: string | null }>;

    return rows
      .map((row) => String(row.session_id ?? "").trim())
      .filter((value) => value.length > 0);
  }

  createArtifact(
    taskId: string,
    runId: string | null,
    kind: "improved_notes" | "plan" | "execution_context",
    contentMd: string
  ): void {
    this.#db.query(
      `
      INSERT INTO task_artifacts (
        id,
        task_id,
        run_id,
        kind,
        content_md,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(crypto.randomUUID(), taskId, runId, kind, contentMd, isoNow());
  }

  #getUserVersion(): number {
    const row = this.#db.query("PRAGMA user_version").get() as {
      user_version: number;
    };
    return Number(row?.user_version ?? 0);
  }

  #setUserVersion(version: number): void {
    this.#db.exec(`PRAGMA user_version = ${Math.max(0, Math.floor(version))}`);
  }

  #migrate(): void {
    const current = this.#getUserVersion();
    if (current >= CURRENT_SCHEMA_VERSION) return;

    this.#db.exec("BEGIN");
    try {
      if (current < 1) {
        this.#db.exec(`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            stage_path TEXT NOT NULL,
            title TEXT NOT NULL,
            notes_md TEXT NOT NULL DEFAULT '',
            plan_md TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            planned_at TEXT,
            executed_at TEXT,
            last_action TEXT,
            last_action_session_id TEXT,
            version INTEGER NOT NULL DEFAULT 1
          );

          CREATE TABLE IF NOT EXISTS task_sources (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            url TEXT,
            source_title TEXT,
            source_meta_json TEXT NOT NULL DEFAULT '{}',
            content_text TEXT,
            fetch_status TEXT NOT NULL DEFAULT 'idle',
            fetch_http_status INTEGER,
            fetch_error TEXT,
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS task_runs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            action TEXT NOT NULL,
            session_id TEXT,
            status TEXT NOT NULL,
            prompt_snapshot TEXT NOT NULL,
            output_text TEXT,
            error_text TEXT,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS task_artifacts (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            run_id TEXT,
            kind TEXT NOT NULL,
            content_md TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (run_id) REFERENCES task_runs(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_tasks_stage_updated
            ON tasks(stage_path, updated_at DESC);

          CREATE INDEX IF NOT EXISTS idx_task_sources_task_updated
            ON task_sources(task_id, updated_at DESC);

          CREATE INDEX IF NOT EXISTS idx_task_runs_task_started
            ON task_runs(task_id, started_at DESC);

          CREATE INDEX IF NOT EXISTS idx_task_runs_session
            ON task_runs(session_id);
        `);
      }

      this.#setUserVersion(CURRENT_SCHEMA_VERSION);
      this.#db.exec("COMMIT");
    } catch (err) {
      this.#db.exec("ROLLBACK");
      throw err;
    }
  }

  #getTaskSourceOrThrow(sourceId: string): TaskSource {
    const source = this.getTaskSource(sourceId);
    if (!source) {
      throw new Error(`Task source not found: ${sourceId}`);
    }
    return source;
  }
}

function mapSourceRow(row: TaskSourceRow): TaskSource {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind as TaskSourceKind,
    url: row.url,
    title: row.source_title,
    content: row.content_text,
    fetchStatus: row.fetch_status as TaskSourceFetchStatus,
    httpStatus: row.fetch_http_status,
    error: row.fetch_error,
    fetchedAt: row.fetched_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRow(row: TaskRunRow): TaskRun {
  return {
    id: row.id,
    taskId: row.task_id,
    action: row.action as TaskAction,
    status: row.status as TaskRunStatus,
    sessionId: row.session_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    output: row.output_text,
    error: row.error_text,
  };
}

function normalizeTaskStatus(value: string): TaskCardStatus {
  const status = String(value ?? "").trim();
  if (status === "draft" || status === "planned") return "todo";
  if (status === "running") return "in_progress";
  if (status === "blocked") return "blocked_by";
  if (
    status === "todo"
    || status === "in_progress"
    || status === "done"
    || status === "blocked_by"
    || status === "archived"
  ) {
    return status;
  }
  return "todo";
}

function isoNow(): string {
  return new Date().toISOString();
}
