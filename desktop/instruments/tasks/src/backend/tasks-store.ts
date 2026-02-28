import type {
  StorageAPI,
  TaskAction,
  TaskCardDetail,
  TaskCardStatus,
  TaskCardSummary,
  TaskRun,
  TaskRunStatus,
  TaskSource,
  TaskSourceFetchStatus,
  TaskSourceKind,
} from "./types.ts";

const CURRENT_SCHEMA_VERSION = 2;
const DEFAULT_DB_NAME = "tasks";

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

type SqlRow = Record<string, unknown>;

export class TasksStore {
  #storage: StorageAPI;
  #dbName: string;
  #ready: Promise<void>;

  constructor(storage: StorageAPI, dbName: string = DEFAULT_DB_NAME) {
    this.#storage = storage;
    this.#dbName = String(dbName || DEFAULT_DB_NAME).trim() || DEFAULT_DB_NAME;
    this.#ready = this.#migrate();
  }

  async close(): Promise<void> {
    await this.#ready;
  }

  async listStageTasks(stagePath: string): Promise<TaskCardSummary[]> {
    await this.#ready;
    const rows = await this.#query(
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
      `,
      [stagePath]
    );

    return rows.map((row) => ({
      id: asString(row.id),
      stagePath: asString(row.stage_path),
      title: asString(row.title),
      status: normalizeTaskStatus(asString(row.status)),
      updatedAt: asString(row.updated_at),
      hasPlan: Number(row.has_plan ?? 0) > 0,
    }));
  }

  async getTaskDetail(taskId: string): Promise<TaskCardDetail | null> {
    await this.#ready;
    const taskRows = await this.#query(
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
      LIMIT 1
      `,
      [taskId]
    );

    const taskRow = taskRows[0];
    if (!taskRow) return null;

    const sourceRows = await this.#query(
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
      `,
      [taskId]
    );

    const runRows = await this.#query(
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
      `,
      [taskId]
    );

    return {
      id: asString(taskRow.id),
      stagePath: asString(taskRow.stage_path),
      title: asString(taskRow.title),
      notes: asString(taskRow.notes_md),
      planMarkdown: asNullableString(taskRow.plan_md),
      status: normalizeTaskStatus(asString(taskRow.status)),
      sources: sourceRows.map(mapSourceRow),
      lastRun: runRows[0] ? mapRunRow(runRows[0]) : null,
      createdAt: asString(taskRow.created_at),
      updatedAt: asString(taskRow.updated_at),
    };
  }

  async getTaskStagePath(taskId: string): Promise<string | null> {
    await this.#ready;
    const rows = await this.#query(
      "SELECT stage_path FROM tasks WHERE id = ? LIMIT 1",
      [taskId]
    );
    return rows[0] ? asNullableString(rows[0].stage_path) : null;
  }

  async createTask(
    stagePath: string,
    title: string,
    notesMd: string
  ): Promise<TaskCardDetail> {
    await this.#ready;
    const id = crypto.randomUUID();
    const now = isoNow();

    await this.#execute(
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
      `,
      [id, stagePath, title, notesMd, now, now]
    );

    const detail = await this.getTaskDetail(id);
    if (!detail) {
      throw new Error("Failed to create task");
    }
    return detail;
  }

  async updateTask(taskId: string, fields: TaskUpdateFields): Promise<TaskCardDetail | null> {
    await this.#ready;
    const exists = await this.#exists("SELECT id FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    if (!exists) return null;

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

    await this.#execute(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values);
    return this.getTaskDetail(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.#ready;
    await this.#execute("DELETE FROM tasks WHERE id = ?", [taskId]);
  }

  async addTaskSource(
    taskId: string,
    kind: TaskSourceKind,
    url: string | null,
    contentText: string | null
  ): Promise<TaskSource> {
    await this.#ready;
    const sourceId = crypto.randomUUID();
    const now = isoNow();

    await this.#execute(
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
      `,
      [sourceId, taskId, kind, url, contentText, now, now]
    );

    const source = await this.getTaskSource(sourceId);
    if (!source) {
      throw new Error(`Task source not found: ${sourceId}`);
    }
    return source;
  }

  async getTaskSource(sourceId: string): Promise<TaskSource | null> {
    await this.#ready;
    const rows = await this.#query(
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
      LIMIT 1
      `,
      [sourceId]
    );

    return rows[0] ? mapSourceRow(rows[0]) : null;
  }

  async getTaskSourceTaskId(sourceId: string): Promise<string | null> {
    await this.#ready;
    const rows = await this.#query(
      "SELECT task_id FROM task_sources WHERE id = ? LIMIT 1",
      [sourceId]
    );
    return rows[0] ? asNullableString(rows[0].task_id) : null;
  }

  async updateTaskSource(sourceId: string, fields: TaskSourceUpdateFields): Promise<TaskSource | null> {
    await this.#ready;
    const exists = await this.#exists("SELECT id FROM task_sources WHERE id = ? LIMIT 1", [sourceId]);
    if (!exists) return null;

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

    await this.#execute(`UPDATE task_sources SET ${updates.join(", ")} WHERE id = ?`, values);
    return this.getTaskSource(sourceId);
  }

  async removeTaskSource(sourceId: string): Promise<void> {
    await this.#ready;
    await this.#execute("DELETE FROM task_sources WHERE id = ?", [sourceId]);
  }

  async getTaskRuns(taskId: string, limit = 20): Promise<TaskRun[]> {
    await this.#ready;
    const rows = await this.#query(
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
      `,
      [taskId, Math.max(1, limit)]
    );
    return rows.map(mapRunRow);
  }

  async getTaskRun(runId: string): Promise<TaskRun | null> {
    await this.#ready;
    const rows = await this.#query(
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
      LIMIT 1
      `,
      [runId]
    );
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async findRunningRun(taskId: string, action: TaskAction): Promise<TaskRun | null> {
    await this.#ready;
    const rows = await this.#query(
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
      `,
      [taskId, action]
    );
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async createTaskRun(
    taskId: string,
    action: TaskAction,
    promptSnapshot: string,
    status: TaskRunStatus = "running",
    sessionId: string | null = null
  ): Promise<TaskRun> {
    await this.#ready;
    const runId = crypto.randomUUID();
    const now = isoNow();

    await this.#execute(
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
      `,
      [runId, taskId, action, sessionId, status, promptSnapshot, now]
    );

    const run = await this.getTaskRun(runId);
    if (!run) throw new Error("Failed to create task run");
    return run;
  }

  async updateTaskRun(runId: string, fields: TaskRunUpdateFields): Promise<TaskRun | null> {
    await this.#ready;
    const exists = await this.#exists("SELECT id FROM task_runs WHERE id = ? LIMIT 1", [runId]);
    if (!exists) return null;

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

    await this.#execute(`UPDATE task_runs SET ${updates.join(", ")} WHERE id = ?`, values);
    return this.getTaskRun(runId);
  }

  async appendTaskRunOutput(runId: string, chunk: string): Promise<TaskRun | null> {
    await this.#ready;
    if (!chunk) return this.getTaskRun(runId);

    const rows = await this.#query(
      "SELECT output_text FROM task_runs WHERE id = ? LIMIT 1",
      [runId]
    );
    const row = rows[0];
    if (!row) return null;

    const next = `${asNullableString(row.output_text) ?? ""}${chunk}`;
    return this.updateTaskRun(runId, { outputText: next });
  }

  async getTaskRunBySessionId(sessionId: string): Promise<TaskRun | null> {
    await this.#ready;
    const rows = await this.#query(
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
      `,
      [sessionId]
    );
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async listHiddenTaskSessionIds(): Promise<string[]> {
    await this.#ready;
    const rows = await this.#query(
      `
      SELECT DISTINCT session_id
      FROM task_runs
      WHERE session_id IS NOT NULL
        AND trim(session_id) <> ''
        AND action IN ('improve', 'plan')
      `
    );

    return rows
      .map((row) => asString(row.session_id).trim())
      .filter((value) => value.length > 0);
  }

  async createArtifact(
    taskId: string,
    runId: string | null,
    kind: "improved_notes" | "plan" | "execution_context",
    contentMd: string
  ): Promise<void> {
    await this.#ready;
    await this.#execute(
      `
      INSERT INTO task_artifacts (
        id,
        task_id,
        run_id,
        kind,
        content_md,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [crypto.randomUUID(), taskId, runId, kind, contentMd, isoNow()]
    );
  }

  async #exists(sql: string, params: unknown[] = []): Promise<boolean> {
    const rows = await this.#query(sql, params);
    return rows.length > 0;
  }

  async #getUserVersion(): Promise<number> {
    const rows = await this.#query("PRAGMA user_version");
    if (rows.length === 0) return 0;
    const row = rows[0];
    if (typeof row.user_version === "number") return row.user_version;
    if (typeof row.user_version === "string") return Number(row.user_version) || 0;
    const first = Object.values(row)[0];
    if (typeof first === "number") return first;
    if (typeof first === "string") return Number(first) || 0;
    return 0;
  }

  async #setUserVersion(version: number): Promise<void> {
    await this.#execute(`PRAGMA user_version = ${Math.max(0, Math.floor(version))}`);
  }

  async #migrate(): Promise<void> {
    const current = await this.#getUserVersion();
    if (current < 1) {
      await this.#execute(`
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
        )
      `);
      await this.#execute(`
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
        )
      `);
      await this.#execute(`
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
        )
      `);
      await this.#execute(`
        CREATE TABLE IF NOT EXISTS task_artifacts (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          run_id TEXT,
          kind TEXT NOT NULL,
          content_md TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (run_id) REFERENCES task_runs(id) ON DELETE SET NULL
        )
      `);
      await this.#execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_stage_updated
        ON tasks(stage_path, updated_at DESC)
      `);
      await this.#execute(`
        CREATE INDEX IF NOT EXISTS idx_task_sources_task_updated
        ON task_sources(task_id, updated_at DESC)
      `);
      await this.#execute(`
        CREATE INDEX IF NOT EXISTS idx_task_runs_task_started
        ON task_runs(task_id, started_at DESC)
      `);
      await this.#execute(`
        CREATE INDEX IF NOT EXISTS idx_task_runs_session
        ON task_runs(session_id)
      `);
    }

    if (current < 2) {
      await this.#migrateWorkspacePathToStagePath();
    }

    await this.#setUserVersion(CURRENT_SCHEMA_VERSION);
  }

  async #migrateWorkspacePathToStagePath(): Promise<void> {
    const columns = await this.#query("PRAGMA table_info(tasks)");
    if (!Array.isArray(columns) || columns.length === 0) return;

    let hasStagePath = columns.some((column) => asString(column.name) === "stage_path");
    const hasWorkspacePath = columns.some((column) => asString(column.name) === "workspace_path");

    if (!hasStagePath && hasWorkspacePath) {
      try {
        await this.#execute("ALTER TABLE tasks RENAME COLUMN workspace_path TO stage_path");
        hasStagePath = true;
      } catch {
        // Older sqlite variants may fail rename; in that case keep current shape.
      }
    }

    await this.#execute("DROP INDEX IF EXISTS idx_tasks_workspace_updated");
    if (hasStagePath) {
      await this.#execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_stage_updated
        ON tasks(stage_path, updated_at DESC)
      `);
      return;
    }
    throw new Error("Tasks schema migration failed: missing stage_path column");
  }

  async #query<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.#storage.sqlQuery<T>(sql, params, this.#dbName);
  }

  async #execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.#storage.sqlExecute(sql, params, this.#dbName);
  }
}

function mapSourceRow(row: SqlRow): TaskSource {
  return {
    id: asString(row.id),
    taskId: asString(row.task_id),
    kind: asString(row.kind) as TaskSourceKind,
    url: asNullableString(row.url),
    title: asNullableString(row.source_title),
    content: asNullableString(row.content_text),
    fetchStatus: asString(row.fetch_status) as TaskSourceFetchStatus,
    httpStatus: asNullableNumber(row.fetch_http_status),
    error: asNullableString(row.fetch_error),
    fetchedAt: asNullableString(row.fetched_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapRunRow(row: SqlRow): TaskRun {
  return {
    id: asString(row.id),
    taskId: asString(row.task_id),
    action: asString(row.action) as TaskAction,
    status: asString(row.status) as TaskRunStatus,
    sessionId: asNullableString(row.session_id),
    startedAt: asString(row.started_at),
    endedAt: asNullableString(row.ended_at),
    output: asNullableString(row.output_text),
    error: asNullableString(row.error_text),
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

function asString(value: unknown): string {
  return String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoNow(): string {
  return new Date().toISOString();
}
