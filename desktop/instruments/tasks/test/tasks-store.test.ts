import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { TasksStore } from "../src/backend/tasks-store.ts";
import type { StorageAPI } from "../src/backend/types.ts";

class SqliteStorage implements StorageAPI {
  #db: Database;

  constructor(dbPath: string) {
    this.#db = new Database(dbPath, { create: true, strict: true });
    this.#db.exec("PRAGMA foreign_keys = ON;");
  }

  async sqlQuery<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const stmt = this.#db.query(sql);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return rows as T[];
  }

  async sqlExecute(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid: number | null }> {
    const stmt = this.#db.query(sql);
    const result = params.length > 0 ? stmt.run(...params) : stmt.run();
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid: result.lastInsertRowid == null
        ? null
        : Number(result.lastInsertRowid),
    };
  }

  close(): void {
    this.#db.close(false);
  }
}

let tempDir: string;
let dbPath: string;
let storage: SqliteStorage;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "tasks-store-test-"));
  dbPath = join(tempDir, "tasks.db");
  storage = new SqliteStorage(dbPath);
});

afterEach(async () => {
  storage.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe("TasksStore", () => {
  test("migrates schema with required tables and indexes", async () => {
    const store = new TasksStore(storage);
    await store.close();

    const db = new Database(dbPath, { readonly: true, strict: true });
    const objects = db.query(
      `
      SELECT name, type
      FROM sqlite_master
      WHERE name LIKE 'tasks%'
         OR name LIKE 'task_%'
         OR name LIKE 'idx_task_%'
      ORDER BY name
      `
    ).all() as Array<{ name: string; type: string }>;

    const names = new Set(objects.map((entry) => entry.name));
    expect(names.has("tasks")).toBe(true);
    expect(names.has("task_sources")).toBe(true);
    expect(names.has("task_runs")).toBe(true);
    expect(names.has("task_artifacts")).toBe(true);
    expect(names.has("idx_tasks_stage_updated")).toBe(true);
    expect(names.has("idx_task_sources_task_updated")).toBe(true);
    expect(names.has("idx_task_runs_task_started")).toBe(true);
    expect(names.has("idx_task_runs_session")).toBe(true);
    db.close(false);
  });

  test("supports CRUD for tasks, sources, and runs", async () => {
    const store = new TasksStore(storage);

    const created = await store.createTask("/repo/a", "Task A", "notes");
    expect(created.title).toBe("Task A");
    expect(created.status).toBe("todo");

    const updated = await store.updateTask(created.id, {
      notesMd: "notes updated",
      status: "planned",
      planMd: "# Plan",
    });
    expect(updated?.notes).toBe("notes updated");
    expect(updated?.status).toBe("todo");

    const source = await store.addTaskSource(created.id, "url", "https://example.com", "raw");
    expect(source.kind).toBe("url");
    expect(source.url).toBe("https://example.com");

    const sourceUpdated = await store.updateTaskSource(source.id, {
      sourceTitle: "Example",
      contentText: "updated body",
      fetchStatus: "success",
      fetchHttpStatus: 200,
      fetchedAt: new Date().toISOString(),
    });
    expect(sourceUpdated?.title).toBe("Example");
    expect(sourceUpdated?.fetchStatus).toBe("success");

    const run = await store.createTaskRun(created.id, "plan", "prompt snapshot", "running");
    expect(run.action).toBe("plan");
    expect(run.status).toBe("running");

    await store.appendTaskRunOutput(run.id, "step 1");
    const runAfter = await store.updateTaskRun(run.id, {
      status: "completed",
      endedAt: new Date().toISOString(),
    });
    expect(runAfter?.status).toBe("completed");
    expect(runAfter?.output).toContain("step 1");

    await store.createArtifact(created.id, run.id, "plan", "# Plan");

    const detail = await store.getTaskDetail(created.id);
    expect(detail?.sources).toHaveLength(1);
    expect(detail?.lastRun?.id).toBe(run.id);

    await store.removeTaskSource(source.id);
    const detailAfterSourceDelete = await store.getTaskDetail(created.id);
    expect(detailAfterSourceDelete?.sources).toHaveLength(0);

    await store.deleteTask(created.id);
    const deleted = await store.getTaskDetail(created.id);
    expect(deleted).toBeNull();

    await store.close();
  });

  test("lists hidden session ids for improve and plan runs only", async () => {
    const store = new TasksStore(storage);

    const task = await store.createTask("/repo/a", "Task A", "notes");
    await store.createTaskRun(task.id, "improve", "prompt", "completed", "sess-improve");
    await store.createTaskRun(task.id, "plan", "prompt", "completed", "sess-plan");
    await store.createTaskRun(task.id, "execute", "prompt", "completed", "sess-execute");
    await store.createTaskRun(task.id, "improve", "prompt", "completed", null);

    const ids = (await store.listHiddenTaskSessionIds()).sort();
    expect(ids).toEqual(["sess-improve", "sess-plan"]);

    await store.close();
  });
});
