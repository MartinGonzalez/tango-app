import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { TasksStore } from "../src/bun/tasks-store.ts";

let tempDir: string;
let dbPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "tasks-store-test-"));
  dbPath = join(tempDir, "tasks.db");
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true });
  } catch {}
});

describe("TasksStore", () => {
  test("migrates schema with required tables and indexes", () => {
    const store = new TasksStore(dbPath);
    store.close();

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
    expect(names.has("idx_tasks_workspace_updated")).toBe(true);
    expect(names.has("idx_task_sources_task_updated")).toBe(true);
    expect(names.has("idx_task_runs_task_started")).toBe(true);
    expect(names.has("idx_task_runs_session")).toBe(true);
    db.close(false);
  });

  test("supports CRUD for tasks, sources, and runs", () => {
    const store = new TasksStore(dbPath);

    const created = store.createTask("/repo/a", "Task A", "notes");
    expect(created.title).toBe("Task A");
    expect(created.status).toBe("todo");

    const updated = store.updateTask(created.id, {
      notesMd: "notes updated",
      status: "planned",
      planMd: "# Plan",
    });
    expect(updated?.notes).toBe("notes updated");
    expect(updated?.status).toBe("todo");

    const source = store.addTaskSource(created.id, "url", "https://example.com", "raw");
    expect(source.kind).toBe("url");
    expect(source.url).toBe("https://example.com");

    const sourceUpdated = store.updateTaskSource(source.id, {
      sourceTitle: "Example",
      contentText: "updated body",
      fetchStatus: "success",
      fetchHttpStatus: 200,
      fetchedAt: new Date().toISOString(),
    });
    expect(sourceUpdated?.title).toBe("Example");
    expect(sourceUpdated?.fetchStatus).toBe("success");

    const run = store.createTaskRun(created.id, "plan", "prompt snapshot", "running");
    expect(run.action).toBe("plan");
    expect(run.status).toBe("running");

    store.appendTaskRunOutput(run.id, "step 1");
    const runAfter = store.updateTaskRun(run.id, {
      status: "completed",
      endedAt: new Date().toISOString(),
    });
    expect(runAfter?.status).toBe("completed");
    expect(runAfter?.output).toContain("step 1");

    store.createArtifact(created.id, run.id, "plan", "# Plan");

    const detail = store.getTaskDetail(created.id);
    expect(detail?.sources).toHaveLength(1);
    expect(detail?.lastRun?.id).toBe(run.id);

    store.removeTaskSource(source.id);
    const detailAfterSourceDelete = store.getTaskDetail(created.id);
    expect(detailAfterSourceDelete?.sources).toHaveLength(0);

    store.deleteTask(created.id);
    const deleted = store.getTaskDetail(created.id);
    expect(deleted).toBeNull();

    store.close();
  });

  test("lists hidden session ids for improve and plan runs only", () => {
    const store = new TasksStore(dbPath);

    const task = store.createTask("/repo/a", "Task A", "notes");
    store.createTaskRun(task.id, "improve", "prompt", "completed", "sess-improve");
    store.createTaskRun(task.id, "plan", "prompt", "completed", "sess-plan");
    store.createTaskRun(task.id, "execute", "prompt", "completed", "sess-execute");
    store.createTaskRun(task.id, "improve", "prompt", "completed", null);

    const ids = store.listHiddenTaskSessionIds().sort();
    expect(ids).toEqual(["sess-improve", "sess-plan"]);

    store.close();
  });
});
