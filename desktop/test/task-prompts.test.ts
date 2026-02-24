import { describe, expect, test } from "bun:test";
import { buildTaskActionPrompt } from "../src/bun/task-prompts.ts";
import type { TaskCardDetail } from "../src/shared/types.ts";

const SAMPLE_TASK: TaskCardDetail = {
  id: "task-1",
  workspacePath: "/repo/a",
  title: "Implement tasks sidebar",
  notes: "Need a sidebar grouped by workspace.",
  planMarkdown: "1. Add state\n2. Add UI",
  status: "planned",
  sources: [
    {
      id: "source-1",
      taskId: "task-1",
      kind: "jira",
      url: "https://example.atlassian.net/browse/PROJ-1",
      title: "PROJ-1",
      content: "Acceptance criteria",
      fetchStatus: "success",
      httpStatus: 200,
      error: null,
      fetchedAt: "2026-02-24T00:00:00.000Z",
      updatedAt: "2026-02-24T00:00:00.000Z",
    },
  ],
  lastRun: null,
  createdAt: "2026-02-24T00:00:00.000Z",
  updatedAt: "2026-02-24T00:00:00.000Z",
};

describe("task prompts", () => {
  test("builds improve prompt with context", () => {
    const prompt = buildTaskActionPrompt(SAMPLE_TASK, "improve");
    expect(prompt).toContain("Rewrite the notes");
    expect(prompt).toContain("pure rewriting task");
    expect(prompt).toContain("Do not mention tools");
    expect(prompt).toContain("ONLY the improved note body");
    expect(prompt).toContain("## Notes");
    expect(prompt).toContain("Acceptance criteria");
  });

  test("builds plan prompt with required sections", () => {
    const prompt = buildTaskActionPrompt(SAMPLE_TASK, "plan");
    expect(prompt).toContain("Required sections");
    expect(prompt).toContain("Implementation Steps");
    expect(prompt).toContain("## Sources");
  });

  test("builds execute prompt with plan and notes", () => {
    const prompt = buildTaskActionPrompt(SAMPLE_TASK, "execute");
    expect(prompt).toContain("Execute this engineering task");
    expect(prompt).toContain("## Existing Plan");
    expect(prompt).toContain("Need a sidebar grouped by workspace");
  });
});
