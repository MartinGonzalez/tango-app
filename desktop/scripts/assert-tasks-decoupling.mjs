import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");

const forbiddenCoreFiles = [
  resolve(desktopRoot, "src/bun/task-repository.ts"),
  resolve(desktopRoot, "src/bun/tasks-store.ts"),
  resolve(desktopRoot, "src/bun/task-prompts.ts"),
  resolve(desktopRoot, "src/bun/task-source-fetcher.ts"),
  resolve(desktopRoot, "src/bun/slack-source-fetcher.ts"),
  resolve(desktopRoot, "src/bun/jira-source-fetcher.ts"),
  resolve(desktopRoot, "src/mainview/components/tasks-view.ts"),
  resolve(desktopRoot, "src/mainview/components/tasks-sidebar.ts"),
  resolve(desktopRoot, "src/shared/types/tasks.ts"),
];

const scans = [
  {
    file: resolve(desktopRoot, "src/mainview/index.ts"),
    patterns: [
      /TASKS_INSTRUMENT_ID/,
      /viewMode\s*:\s*["']tasks["']/,
      /invokeTasksInstrument/,
    ],
  },
  {
    file: resolve(desktopRoot, "src/bun/index.ts"),
    patterns: [
      /invokeTasksInstrument/,
      /getStageTasks/,
      /getTaskDetail/,
      /runTaskAction/,
      /task-repository/,
      /tasks-store/,
    ],
  },
  {
    file: resolve(desktopRoot, "src/shared/types/rpc.ts"),
    patterns: [
      /getStageTasks/,
      /getTaskDetail/,
      /createTask/,
      /updateTask/,
      /deleteTask/,
      /addTaskSource/,
      /updateTaskSource/,
      /removeTaskSource/,
      /fetchTaskSource/,
      /runTaskAction/,
      /getTaskRuns/,
    ],
  },
];

const failures = [];

for (const filePath of forbiddenCoreFiles) {
  try {
    await access(filePath, constants.F_OK);
    failures.push(`Forbidden core file still exists: ${filePath}`);
  } catch {
    // expected missing
  }
}

for (const scan of scans) {
  const source = await readFile(scan.file, "utf8");
  for (const pattern of scan.patterns) {
    if (pattern.test(source)) {
      failures.push(`Forbidden coupling pattern ${pattern} found in ${scan.file}`);
    }
  }
}

const tasksBackendDist = await readFile(
  resolve(desktopRoot, "instruments/tasks/dist/backend.js"),
  "utf8"
);
if (tasksBackendDist.includes("../../../src/")) {
  failures.push("Tasks backend dist still references ../../../src/");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Tasks decoupling checks passed.");
