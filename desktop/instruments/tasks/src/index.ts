import {
  badge,
  button,
  card,
  createRoot,
  emptyState,
  ensureInstrumentUI,
  group,
  groupEmpty,
  groupItem,
  groupList,
  input,
  panelHeader,
  section,
  select,
  textarea,
} from "@tango/instrument-ui";

type TaskStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "blocked_by"
  | "draft"
  | "planned"
  | "running";

type TaskSummary = {
  id: string;
  title?: string | null;
  status?: TaskStatus | null;
};

type TaskSource = {
  id: string;
  kind: string;
  url?: string | null;
  content?: string | null;
};

type TaskRun = {
  action: string;
  status: string;
  sessionId?: string | null;
};

type TaskDetail = {
  id: string;
  stagePath: string;
  title?: string | null;
  notes?: string | null;
  status?: TaskStatus | null;
  sources?: TaskSource[];
  lastRun?: TaskRun | null;
};

type InstrumentEventPayload = {
  instrumentId: string;
  event: string;
  payload?: Record<string, unknown>;
};

type StageRemovedPayload = { path: string };

type TasksContext = {
  instrumentId: string;
  invoke: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
  stages: {
    list: () => Promise<string[]>;
  };
  sessions: {
    focus: (params: { sessionId: string; cwd?: string }) => Promise<void>;
  };
  panels: {
    mount: (slot: "sidebar" | "second", node: HTMLElement) => void;
    unmount: (slot: "sidebar" | "second") => void;
    setVisible: (slot: "sidebar" | "second", visible: boolean) => void;
  };
  events: {
    subscribe: <T>(
      event: string,
      handler: (payload: T) => void | Promise<void>,
    ) => () => void;
  };
};

type RuntimeState = {
  active: boolean;
  loading: boolean;
  stages: string[];
  tasksByStage: Record<string, TaskSummary[]>;
  expandedStagePaths: Set<string>;
  collapsedStagePaths: Set<string>;
  animatingStagePath: string | null;
  selectedTaskId: string | null;
  selectedTaskDetail: TaskDetail | null;
  error: string | null;
};

let runtime: { deactivate: () => void } | null = null;

function stageNameFromPath(stagePath: string): string {
  const normalized = String(stagePath ?? "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || stagePath;
}

function mutedText(text: string): HTMLElement {
  const node = document.createElement("div");
  node.textContent = text;
  node.style.fontSize = "12px";
  node.style.color = "var(--tui-text-secondary)";
  return node;
}

function sectionTitle(text: string): HTMLElement {
  const node = document.createElement("div");
  node.textContent = text;
  node.style.fontSize = "12px";
  node.style.fontWeight = "600";
  return node;
}

function previewText(text: string): HTMLElement {
  const node = document.createElement("div");
  node.textContent = text;
  node.style.fontSize = "12px";
  node.style.color = "var(--tui-text-secondary)";
  node.style.whiteSpace = "pre-wrap";
  node.style.wordBreak = "break-word";
  return node;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toneForStatus(status: string | null | undefined): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "done":
      return "success";
    case "running":
    case "in_progress":
      return "info";
    case "blocked_by":
      return "danger";
    case "planned":
    case "draft":
      return "warning";
    default:
      return "neutral";
  }
}

function createRuntime(ctx: TasksContext): { deactivate: () => void } {
  ensureInstrumentUI();
  const sidebarRoot = createRoot({ className: "tasks-ui-sidebar" });
  const secondRoot = createRoot({ className: "tasks-ui-main" });
  sidebarRoot.style.height = "100%";
  sidebarRoot.style.overflow = "auto";
  sidebarRoot.style.padding = "10px";
  sidebarRoot.style.boxSizing = "border-box";
  secondRoot.style.height = "100%";
  secondRoot.style.overflow = "auto";
  secondRoot.style.padding = "12px";
  secondRoot.style.boxSizing = "border-box";

  const state: RuntimeState = {
    active: true,
    loading: false,
    stages: [],
    tasksByStage: {},
    expandedStagePaths: new Set<string>(),
    collapsedStagePaths: new Set<string>(),
    animatingStagePath: null,
    selectedTaskId: null,
    selectedTaskDetail: null,
    error: null,
  };

  const unsubscribers: Array<() => void> = [];

  async function callAndCapture<T>(op: () => Promise<T>): Promise<T | null> {
    try {
      const result = await op();
      state.error = null;
      return result;
    } catch (err) {
      state.error = toErrorMessage(err);
      return null;
    }
  }

  function isStageExpanded(stagePath: string, tasks: TaskSummary[]): boolean {
    const hasSelection = tasks.some((task) => task.id === state.selectedTaskId);
    return state.expandedStagePaths.has(stagePath)
      || (hasSelection && !state.collapsedStagePaths.has(stagePath));
  }

  function toggleStageExpanded(stagePath: string, tasks: TaskSummary[]): void {
    const expanded = isStageExpanded(stagePath, tasks);
    if (expanded) {
      state.expandedStagePaths.delete(stagePath);
      state.collapsedStagePaths.add(stagePath);
    } else {
      state.expandedStagePaths.add(stagePath);
      state.collapsedStagePaths.delete(stagePath);
    }
    state.animatingStagePath = stagePath;
    render();
  }

  async function loadTaskDetail(taskId: string): Promise<void> {
    if (!state.active || !taskId) return;
    const detail = await callAndCapture(() => ctx.invoke<TaskDetail | null>("getTaskDetail", { taskId }));
    state.selectedTaskDetail = detail ?? null;
    state.selectedTaskId = detail?.id ?? null;
  }

  async function loadStageTasks(stagePath: string): Promise<void> {
    if (!stagePath) return;
    const tasks = await callAndCapture(() => ctx.invoke<TaskSummary[]>("listStageTasks", { stagePath }));
    state.tasksByStage[stagePath] = Array.isArray(tasks) ? tasks : [];
  }

  async function loadAll(): Promise<void> {
    state.loading = true;
    render();
    try {
      const stages = await ctx.stages.list();
      state.stages = Array.isArray(stages) ? stages : [];
      const stageSet = new Set(state.stages);
      for (const path of Array.from(state.expandedStagePaths)) {
        if (!stageSet.has(path)) {
          state.expandedStagePaths.delete(path);
        }
      }
      for (const path of Array.from(state.collapsedStagePaths)) {
        if (!stageSet.has(path)) {
          state.collapsedStagePaths.delete(path);
        }
      }

      const map: Record<string, TaskSummary[]> = {};
      for (const stagePath of state.stages) {
        const tasks = await ctx.invoke<TaskSummary[]>("listStageTasks", { stagePath });
        map[stagePath] = Array.isArray(tasks) ? tasks : [];
      }
      state.tasksByStage = map;

      if (!state.selectedTaskId) {
        for (const stagePath of state.stages) {
          const first = (state.tasksByStage[stagePath] ?? [])[0];
          if (first?.id) {
            state.selectedTaskId = first.id;
            break;
          }
        }
      }
      if (state.selectedTaskId) {
        await loadTaskDetail(state.selectedTaskId);
      }
      state.error = null;
    } catch (err) {
      state.error = toErrorMessage(err);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function createTask(stagePath: string): Promise<void> {
    if (!stagePath) return;
    state.expandedStagePaths.add(stagePath);
    state.collapsedStagePaths.delete(stagePath);
    await callAndCapture(() => ctx.invoke("createTask", {
      stagePath,
      title: "Untitled task",
      notes: "",
    }));
    await loadStageTasks(stagePath);
    const first = (state.tasksByStage[stagePath] ?? [])[0];
    if (first?.id) {
      state.selectedTaskId = first.id;
      await loadTaskDetail(first.id);
    }
    render();
  }

  async function saveTask(patch: Record<string, unknown>): Promise<void> {
    if (!state.selectedTaskId) return;
    await callAndCapture(() => ctx.invoke("updateTask", {
      taskId: state.selectedTaskId,
      patch,
    }));
    const stagePath = state.selectedTaskDetail?.stagePath;
    if (stagePath) {
      await loadStageTasks(stagePath);
    }
    if (state.selectedTaskId) {
      await loadTaskDetail(state.selectedTaskId);
    }
    render();
  }

  async function removeTask(): Promise<void> {
    const taskId = state.selectedTaskId;
    const stagePath = state.selectedTaskDetail?.stagePath;
    if (!taskId) return;
    await callAndCapture(() => ctx.invoke("deleteTask", { taskId }));
    state.selectedTaskId = null;
    state.selectedTaskDetail = null;

    if (stagePath) {
      await loadStageTasks(stagePath);
      const next = (state.tasksByStage[stagePath] ?? [])[0];
      if (next?.id) {
        state.selectedTaskId = next.id;
        await loadTaskDetail(next.id);
      }
    }
    render();
  }

  async function runAction(action: "improve" | "plan" | "execute"): Promise<void> {
    if (!state.selectedTaskId) return;
    await callAndCapture(() => ctx.invoke("runTaskAction", {
      taskId: state.selectedTaskId,
      action,
    }));
    const stagePath = state.selectedTaskDetail?.stagePath;
    if (stagePath) {
      await loadStageTasks(stagePath);
    }
    if (state.selectedTaskId) {
      await loadTaskDetail(state.selectedTaskId);
    }
    render();
  }

  async function openSession(): Promise<void> {
    const detail = state.selectedTaskDetail;
    const sessionId = String(detail?.lastRun?.sessionId ?? "").trim();
    if (!detail || !sessionId) return;
    await callAndCapture(() => ctx.sessions.focus({
      sessionId,
      cwd: detail.stagePath,
    }));
  }

  async function refreshSelectedTask(sourceId: string): Promise<void> {
    const detail = state.selectedTaskDetail;
    if (!detail) return;
    await loadTaskDetail(detail.id);
    if (state.selectedTaskDetail?.id !== sourceId && state.selectedTaskId) {
      await loadTaskDetail(state.selectedTaskId);
    }
    render();
  }

  function renderSidebar(): void {
    sidebarRoot.replaceChildren();
    const content: HTMLElement[] = [];
    content.push(panelHeader({
      title: "Tasks",
      subtitle: "Grouped by stage",
      rightActions: [
        badge({
          label: `${state.stages.length} stage${state.stages.length === 1 ? "" : "s"}`,
          tone: "neutral",
        }),
      ],
    }));

    if (state.loading) {
      content.push(section({
        content: card({ content: mutedText("Loading tasks...") }),
      }));
      sidebarRoot.append(...content);
      return;
    }

    if (state.stages.length === 0) {
      content.push(section({
        content: emptyState({
          title: "No stages yet",
          description: "Create or open a stage to start using Tasks.",
        }),
      }));
      sidebarRoot.append(...content);
      return;
    }

    const stageGroups = state.stages.map((stagePath) => {
      const tasks = state.tasksByStage[stagePath] ?? [];
      const stageHasSelection = tasks.some((task) => task.id === state.selectedTaskId);
      const expanded = isStageExpanded(stagePath, tasks);
      const newButton = button({
        label: "New",
        variant: "ghost",
        size: "sm",
        onClick: () => {
          void createTask(stagePath);
        },
      });

      const listContent = tasks.length
        ? groupList({
            items: tasks.map((task) => groupItem({
              title: task.title || "Untitled",
              subtitle: task.status || "todo",
              active: task.id === state.selectedTaskId,
              onClick: () => {
                state.expandedStagePaths.add(stagePath);
                state.collapsedStagePaths.delete(stagePath);
                state.selectedTaskId = task.id;
                void loadTaskDetail(task.id).then(() => render());
              },
            })),
          })
        : groupEmpty({ text: "No tasks" });

      return group({
        title: stageNameFromPath(stagePath),
        subtitle: stagePath,
        meta: [
          badge({
            label: `${tasks.length}`,
            tone: tasks.length ? "info" : "neutral",
          }),
        ],
        actions: expanded ? [newButton] : [],
        active: stageHasSelection,
        expanded,
        animate: state.animatingStagePath === stagePath,
        onToggle: () => {
          toggleStageExpanded(stagePath, tasks);
        },
        content: listContent,
      });
    });

    content.push(section({
      content: (() => {
        const wrapper = document.createElement("div");
        wrapper.className = "tui-col";
        wrapper.append(...stageGroups);
        return wrapper;
      })(),
    }));

    sidebarRoot.append(...content);
    state.animatingStagePath = null;
  }

  function renderTaskDetail(detail: TaskDetail): HTMLElement {
    const titleInput = input({
      value: detail.title ?? "",
      placeholder: "Task title",
    });

    const statusSelect = select({
      value: String(detail.status ?? "todo"),
      options: [
        { value: "todo", label: "Todo" },
        { value: "in_progress", label: "In Progress" },
        { value: "done", label: "Done" },
        { value: "blocked_by", label: "Blocked" },
        { value: "draft", label: "Draft" },
        { value: "planned", label: "Planned" },
        { value: "running", label: "Running" },
      ],
    });

    const notesInput = textarea({
      value: detail.notes ?? "",
      rows: 8,
      placeholder: "Task notes",
    });

    const saveButton = button({
      label: "Save",
      variant: "primary",
      onClick: () => {
        void saveTask({
          title: titleInput.value,
          notes: notesInput.value,
          status: statusSelect.value,
        });
      },
    });

    const deleteButton = button({
      label: "Delete",
      variant: "danger",
      onClick: () => {
        void removeTask();
      },
    });

    const actionsRow = document.createElement("div");
    actionsRow.className = "tui-row";
    actionsRow.append(saveButton, deleteButton);

    const taskCardBody = document.createElement("div");
    taskCardBody.className = "tui-col";
    taskCardBody.append(
      sectionTitle("Title"),
      titleInput,
      sectionTitle("Status"),
      statusSelect,
      sectionTitle("Notes"),
      notesInput,
      actionsRow,
    );

    const taskSection = section({
      title: "Task",
      content: card({ content: taskCardBody }),
    });

    const sourceKind = select({
      options: [
        { value: "manual", label: "manual" },
        { value: "url", label: "url" },
        { value: "slack", label: "slack" },
        { value: "jira", label: "jira" },
      ],
      value: "manual",
    });
    const sourceUrl = input({
      placeholder: "Source URL (optional)",
    });

    const addSourceButton = button({
      label: "Add source",
      variant: "secondary",
      onClick: () => {
        void callAndCapture(() => ctx.invoke("addTaskSource", {
          taskId: detail.id,
          kind: sourceKind.value,
          url: sourceUrl.value || null,
        })).then(async () => {
          sourceUrl.value = "";
          await refreshSelectedTask(detail.id);
        });
      },
    });

    const sourceCards = (detail.sources ?? []).map((source) => {
      const fetchButton = button({
        label: "Fetch",
        variant: "secondary",
        size: "sm",
        onClick: () => {
          void callAndCapture(() => ctx.invoke("fetchTaskSource", {
            sourceId: source.id,
          })).then(async () => {
            await refreshSelectedTask(detail.id);
          });
        },
      });

      const removeButton = button({
        label: "Remove",
        variant: "danger",
        size: "sm",
        onClick: () => {
          void callAndCapture(() => ctx.invoke("removeTaskSource", {
            sourceId: source.id,
          })).then(async () => {
            await refreshSelectedTask(detail.id);
          });
        },
      });

      const sourceActions = document.createElement("div");
      sourceActions.className = "tui-row";
      sourceActions.append(fetchButton, removeButton);

      const sourceBody = document.createElement("div");
      sourceBody.className = "tui-col";
      sourceBody.append(
        mutedText(`${source.kind} • ${source.url || "manual"}`),
        source.content
          ? previewText(String(source.content).slice(0, 300))
          : mutedText("No content fetched yet."),
        sourceActions,
      );

      return card({ content: sourceBody });
    });

    const sourceForm = document.createElement("div");
    sourceForm.className = "tui-col";
    sourceForm.append(
      sectionTitle("Kind"),
      sourceKind,
      sectionTitle("URL"),
      sourceUrl,
      addSourceButton,
    );

    const sourcesSection = section({
      title: "Sources",
      content: (() => {
        const wrapper = document.createElement("div");
        wrapper.className = "tui-col";
        if (sourceCards.length) {
          wrapper.append(...sourceCards);
        }
        wrapper.append(card({ content: sourceForm }));
        return wrapper;
      })(),
    });

    const improveButton = button({
      label: "Improve",
      variant: "secondary",
      onClick: () => {
        void runAction("improve");
      },
    });

    const planButton = button({
      label: "Plan",
      variant: "secondary",
      onClick: () => {
        void runAction("plan");
      },
    });

    const executeButton = button({
      label: "Execute",
      variant: "primary",
      onClick: () => {
        void runAction("execute");
      },
    });

    const openSessionButton = button({
      label: "Open Session",
      variant: "ghost",
      disabled: !detail.lastRun?.sessionId,
      onClick: () => {
        void openSession();
      },
    });

    const taskActionsRow = document.createElement("div");
    taskActionsRow.className = "tui-row";
    taskActionsRow.style.flexWrap = "wrap";
    taskActionsRow.append(improveButton, planButton, executeButton, openSessionButton);

    const runSummary = detail.lastRun
      ? `${detail.lastRun.action} • ${detail.lastRun.status}${detail.lastRun.sessionId ? ` • ${detail.lastRun.sessionId}` : ""}`
      : "No runs yet.";

    const actionsBody = document.createElement("div");
    actionsBody.className = "tui-col";
    actionsBody.append(
      taskActionsRow,
      badge({
        label: runSummary,
        tone: toneForStatus(detail.lastRun?.status),
      }),
    );

    const actionsSection = section({
      title: "Actions",
      content: card({ content: actionsBody }),
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tui-col";
    wrapper.append(taskSection, sourcesSection, actionsSection);
    return wrapper;
  }

  function renderMain(): void {
    secondRoot.replaceChildren();
    const detail = state.selectedTaskDetail;

    secondRoot.append(panelHeader({
      title: detail?.title?.trim() ? detail.title : "Tasks",
      subtitle: detail?.stagePath ? stageNameFromPath(detail.stagePath) : "Select or create a task",
      rightActions: detail?.status
        ? [badge({ label: detail.status, tone: toneForStatus(detail.status) })]
        : [],
    }));

    if (state.error) {
      const errorRow = document.createElement("div");
      errorRow.className = "tui-row";
      errorRow.append(
        badge({ label: "Error", tone: "danger" }),
        previewText(state.error),
      );
      secondRoot.append(section({
        content: card({ content: errorRow }),
      }));
    }

    if (!detail) {
      secondRoot.append(section({
        content: emptyState({
          title: "Select or create a task",
          description: "Pick a task from the sidebar to edit details, sources and actions.",
        }),
      }));
      return;
    }

    secondRoot.append(renderTaskDetail(detail));
  }

  function render(): void {
    if (!state.active) return;
    renderSidebar();
    renderMain();
  }

  ctx.panels.mount("sidebar", sidebarRoot);
  ctx.panels.mount("second", secondRoot);
  ctx.panels.setVisible("sidebar", true);
  ctx.panels.setVisible("second", true);

  unsubscribers.push(
    ctx.events.subscribe<InstrumentEventPayload>("instrument.event", async ({ instrumentId, event, payload }) => {
      if (instrumentId !== ctx.instrumentId || event !== "tasks.changed") return;
      const stagePath = String(payload?.stagePath ?? "").trim();
      const taskId = String(payload?.taskId ?? "").trim();
      if (stagePath) {
        await loadStageTasks(stagePath);
      } else {
        await loadAll();
      }
      if (taskId && state.selectedTaskId === taskId) {
        await loadTaskDetail(taskId);
      }
      render();
    }),
  );

  unsubscribers.push(
    ctx.events.subscribe("stage.added", async () => {
      await loadAll();
    }),
  );

  unsubscribers.push(
    ctx.events.subscribe<StageRemovedPayload>("stage.removed", async ({ path }) => {
      delete state.tasksByStage[path];
      state.expandedStagePaths.delete(path);
      state.collapsedStagePaths.delete(path);
      if (state.selectedTaskDetail?.stagePath === path) {
        state.selectedTaskId = null;
        state.selectedTaskDetail = null;
      }
      await loadAll();
    }),
  );

  void loadAll();

  return {
    deactivate: () => {
      state.active = false;
      for (const unsubscribe of unsubscribers) {
        try {
          unsubscribe();
        } catch {
          // no-op
        }
      }
      ctx.panels.unmount("sidebar");
      ctx.panels.unmount("second");
    },
  };
}

export async function activate(ctx: TasksContext): Promise<void> {
  runtime?.deactivate();
  runtime = createRuntime(ctx);
}

export async function deactivate(): Promise<void> {
  runtime?.deactivate();
  runtime = null;
}

export default {
  activate,
  deactivate,
};
