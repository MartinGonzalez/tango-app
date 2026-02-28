import type { TaskAction, TaskCardDetail, TaskSource } from "./types.ts";

export function buildTaskActionPrompt(task: TaskCardDetail, action: TaskAction): string {
  if (action === "improve") {
    return buildImprovePrompt(task);
  }
  if (action === "plan") {
    return buildPlanPrompt(task);
  }
  return buildExecutePrompt(task);
}

function buildImprovePrompt(task: TaskCardDetail): string {
  return [
    "You are improving a task note for an engineering workflow.",
    "This is a pure rewriting task, not an execution task.",
    "Rewrite the notes to be clearer, structured, and actionable.",
    "Keep all important constraints and context.",
    "Do not invent requirements that are not present.",
    "Do not mention tools, terminal commands, git, checks, or what you 'need to do'.",
    "Do not include prefaces, explanations, or commentary.",
    "Output must be ONLY the improved note body in markdown.",
    "Start immediately with the note content.",
    "",
    renderTaskContext(task, { includePlan: true }),
  ].join("\n");
}

function buildPlanPrompt(task: TaskCardDetail): string {
  return [
    "You are planning a software engineering task.",
    "Create a concrete implementation plan in markdown.",
    "",
    "Required sections:",
    "1. Goal",
    "2. Scope In",
    "3. Scope Out",
    "4. Implementation Steps",
    "5. Risks / Edge Cases",
    "6. Validation Plan",
    "",
    "Use concise but specific language. Avoid fluff.",
    "Output only the plan markdown.",
    "",
    renderTaskContext(task, { includePlan: false }),
  ].join("\n");
}

function buildExecutePrompt(task: TaskCardDetail): string {
  return [
    "Execute this engineering task using the provided context.",
    "Before coding, summarize your intended approach briefly.",
    "Then implement the changes and validate with relevant checks.",
    "",
    renderTaskContext(task, { includePlan: true }),
  ].join("\n");
}

function renderTaskContext(
  task: TaskCardDetail,
  opts: { includePlan: boolean }
): string {
  const sections: string[] = [];
  sections.push("# Task");
  sections.push(`Title: ${task.title}`);
  sections.push(`Status: ${task.status}`);
  sections.push("");

  sections.push("## Notes");
  sections.push(task.notes?.trim() ? task.notes.trim() : "(empty)");
  sections.push("");

  if (opts.includePlan) {
    sections.push("## Existing Plan");
    sections.push(task.planMarkdown?.trim() ? task.planMarkdown.trim() : "(none)");
    sections.push("");
  }

  sections.push("## Sources");
  if (task.sources.length === 0) {
    sections.push("(none)");
  } else {
    for (const source of task.sources) {
      sections.push(renderSource(source));
    }
  }

  return sections.join("\n");
}

function renderSource(source: TaskSource): string {
  const lines = [
    "---",
    `Source ID: ${source.id}`,
    `Kind: ${source.kind}`,
    `URL: ${source.url ?? "(none)"}`,
    `Title: ${source.title ?? "(none)"}`,
    `Fetch: ${source.fetchStatus}${source.httpStatus ? ` (${source.httpStatus})` : ""}`,
    "Content:",
    source.content?.trim() ? source.content.trim() : "(empty)",
  ];

  if (source.error) {
    lines.push(`Error: ${source.error}`);
  }

  return lines.join("\n");
}
