import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  defineReactInstrument,
  useInstrumentApi,
  useHostEvent,
  type InstrumentFrontendAPI,
} from "@tango/instrument-sdk/react";
import {
  UIRoot,
  UIPanelHeader,
  UISection,
  UICard,
  UIButton,
  UIInput,
  UITextarea,
  UISelect,
  UIBadge,
  UIEmptyState,
  UIGroup,
  UIGroupList,
  UIGroupItem,
  UIGroupEmpty,
} from "@tango/instrument-ui/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type State = {
  loading: boolean;
  stages: string[];
  tasksByStage: Record<string, TaskSummary[]>;
  expandedStagePaths: Set<string>;
  collapsedStagePaths: Set<string>;
  selectedTaskId: string | null;
  selectedTaskDetail: TaskDetail | null;
  error: string | null;
  revision: number; // bump to trigger re-renders after async ops
};

type Action =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_STAGES"; stages: string[] }
  | { type: "SET_STAGE_TASKS"; stagePath: string; tasks: TaskSummary[] }
  | { type: "SET_ALL_TASKS"; tasksByStage: Record<string, TaskSummary[]> }
  | { type: "SET_SELECTED"; taskId: string | null; detail: TaskDetail | null }
  | { type: "EXPAND_STAGE"; stagePath: string }
  | { type: "COLLAPSE_STAGE"; stagePath: string }
  | { type: "REMOVE_STAGE"; stagePath: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "BUMP" };

function initialState(): State {
  return {
    loading: false,
    stages: [],
    tasksByStage: {},
    expandedStagePaths: new Set(),
    collapsedStagePaths: new Set(),
    selectedTaskId: null,
    selectedTaskDetail: null,
    error: null,
    revision: 0,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_STAGES": {
      const stageSet = new Set(action.stages);
      const expanded = new Set(state.expandedStagePaths);
      const collapsed = new Set(state.collapsedStagePaths);
      for (const p of expanded) if (!stageSet.has(p)) expanded.delete(p);
      for (const p of collapsed) if (!stageSet.has(p)) collapsed.delete(p);
      return {
        ...state,
        stages: action.stages,
        expandedStagePaths: expanded,
        collapsedStagePaths: collapsed,
      };
    }
    case "SET_STAGE_TASKS":
      return {
        ...state,
        tasksByStage: { ...state.tasksByStage, [action.stagePath]: action.tasks },
      };
    case "SET_ALL_TASKS":
      return { ...state, tasksByStage: action.tasksByStage };
    case "SET_SELECTED":
      return {
        ...state,
        selectedTaskId: action.taskId,
        selectedTaskDetail: action.detail,
      };
    case "EXPAND_STAGE": {
      const expanded = new Set(state.expandedStagePaths);
      const collapsed = new Set(state.collapsedStagePaths);
      expanded.add(action.stagePath);
      collapsed.delete(action.stagePath);
      return { ...state, expandedStagePaths: expanded, collapsedStagePaths: collapsed };
    }
    case "COLLAPSE_STAGE": {
      const expanded = new Set(state.expandedStagePaths);
      const collapsed = new Set(state.collapsedStagePaths);
      expanded.delete(action.stagePath);
      collapsed.add(action.stagePath);
      return { ...state, expandedStagePaths: expanded, collapsedStagePaths: collapsed };
    }
    case "REMOVE_STAGE": {
      const tasksByStage = { ...state.tasksByStage };
      delete tasksByStage[action.stagePath];
      const expanded = new Set(state.expandedStagePaths);
      const collapsed = new Set(state.collapsedStagePaths);
      expanded.delete(action.stagePath);
      collapsed.delete(action.stagePath);
      const resetSelection =
        state.selectedTaskDetail?.stagePath === action.stagePath;
      return {
        ...state,
        tasksByStage,
        expandedStagePaths: expanded,
        collapsedStagePaths: collapsed,
        selectedTaskId: resetSelection ? null : state.selectedTaskId,
        selectedTaskDetail: resetSelection ? null : state.selectedTaskDetail,
      };
    }
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "BUMP":
      return { ...state, revision: state.revision + 1 };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stageNameFromPath(stagePath: string): string {
  const normalized = String(stagePath ?? "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || stagePath;
}

function toneForStatus(
  status: string | null | undefined
): "neutral" | "info" | "success" | "warning" | "danger" {
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

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const STATUS_OPTIONS = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "blocked_by", label: "Blocked" },
  { value: "draft", label: "Draft" },
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
];

const SOURCE_KIND_OPTIONS = [
  { value: "manual", label: "manual" },
  { value: "url", label: "url" },
  { value: "slack", label: "slack" },
  { value: "jira", label: "jira" },
];

// ---------------------------------------------------------------------------
// Cross-panel selection sync via instrument storage
// ---------------------------------------------------------------------------

const SELECTED_TASK_KEY = "__ui_selectedTaskId";

// ---------------------------------------------------------------------------
// Custom hook: useTasksState
// ---------------------------------------------------------------------------

function useTasksState(api: InstrumentFrontendAPI) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  async function callAndCapture<T>(op: () => Promise<T>): Promise<T | null> {
    try {
      const result = await op();
      dispatch({ type: "SET_ERROR", error: null });
      return result;
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: toErrorMessage(err) });
      return null;
    }
  }

  /** Write selected task ID to storage so the other panel can pick it up. */
  const persistSelection = useCallback(
    (taskId: string | null) => {
      void api.storage.setProperty(SELECTED_TASK_KEY, taskId);
    },
    [api]
  );

  /** Read selected task ID from storage (used on mount). */
  const readPersistedSelection = useCallback(async (): Promise<string | null> => {
    try {
      return await api.storage.getProperty<string>(SELECTED_TASK_KEY);
    } catch {
      return null;
    }
  }, [api]);

  const loadTaskDetail = useCallback(
    async (taskId: string): Promise<TaskDetail | null> => {
      if (!taskId) return null;
      const detail = await callAndCapture(() =>
        api.actions.call<{ taskId: string }, TaskDetail | null>("getTaskDetail", { taskId })
      );
      const d = detail ?? null;
      dispatch({ type: "SET_SELECTED", taskId: d?.id ?? null, detail: d });
      return d;
    },
    [api]
  );

  const selectTask = useCallback(
    async (taskId: string): Promise<TaskDetail | null> => {
      persistSelection(taskId);
      // Emit a custom event so the other panel knows about the selection change
      api.emit({ event: "tasks.selection", payload: { taskId } });
      return loadTaskDetail(taskId);
    },
    [api, persistSelection, loadTaskDetail]
  );

  const loadStageTasks = useCallback(
    async (stagePath: string) => {
      if (!stagePath) return;
      const tasks = await callAndCapture(() =>
        api.actions.call<{ stagePath: string }, TaskSummary[]>("listStageTasks", { stagePath })
      );
      dispatch({
        type: "SET_STAGE_TASKS",
        stagePath,
        tasks: Array.isArray(tasks) ? tasks : [],
      });
    },
    [api]
  );

  const loadAll = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const stages = await api.stages.list();
      const stageArr = Array.isArray(stages) ? stages : [];
      dispatch({ type: "SET_STAGES", stages: stageArr });

      const map: Record<string, TaskSummary[]> = {};
      for (const stagePath of stageArr) {
        const tasks = await api.actions.call<{ stagePath: string }, TaskSummary[]>(
          "listStageTasks",
          { stagePath }
        );
        map[stagePath] = Array.isArray(tasks) ? tasks : [];
      }
      dispatch({ type: "SET_ALL_TASKS", tasksByStage: map });

      // Return first task for auto-select if needed
      let firstTask: { id: string } | null = null;
      for (const stagePath of stageArr) {
        const first = (map[stagePath] ?? [])[0];
        if (first?.id) {
          firstTask = first;
          break;
        }
      }
      dispatch({ type: "SET_ERROR", error: null });
      return firstTask;
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: toErrorMessage(err) });
      return null;
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [api]);

  const createTask = useCallback(
    async (stagePath: string) => {
      if (!stagePath) return;
      dispatch({ type: "EXPAND_STAGE", stagePath });
      await callAndCapture(() =>
        api.actions.call("createTask", {
          stagePath,
          title: "Untitled task",
          notes: "",
        })
      );
      await loadStageTasks(stagePath);
      dispatch({ type: "BUMP" });
    },
    [api, loadStageTasks]
  );

  const saveTask = useCallback(
    async (taskId: string, stagePath: string | undefined, patch: Record<string, unknown>) => {
      if (!taskId) return;
      await callAndCapture(() => api.actions.call("updateTask", { taskId, patch }));
      if (stagePath) await loadStageTasks(stagePath);
      await loadTaskDetail(taskId);
    },
    [api, loadStageTasks, loadTaskDetail]
  );

  const removeTask = useCallback(
    async (taskId: string, stagePath: string | undefined) => {
      if (!taskId) return;
      await callAndCapture(() => api.actions.call("deleteTask", { taskId }));
      dispatch({ type: "SET_SELECTED", taskId: null, detail: null });
      persistSelection(null);
      api.emit({ event: "tasks.selection", payload: { taskId: null } });
      if (stagePath) await loadStageTasks(stagePath);
      dispatch({ type: "BUMP" });
    },
    [api, loadStageTasks, persistSelection]
  );

  const runAction = useCallback(
    async (
      taskId: string,
      stagePath: string | undefined,
      action: "improve" | "plan" | "execute"
    ) => {
      if (!taskId) return;
      await callAndCapture(() =>
        api.actions.call("runTaskAction", { taskId, action })
      );
      if (stagePath) await loadStageTasks(stagePath);
      await loadTaskDetail(taskId);
    },
    [api, loadStageTasks, loadTaskDetail]
  );

  const openSession = useCallback(
    async (detail: TaskDetail | null) => {
      const sessionId = String(detail?.lastRun?.sessionId ?? "").trim();
      if (!detail || !sessionId) return;
      await callAndCapture(() =>
        api.sessions.focus({ sessionId, cwd: detail.stagePath })
      );
    },
    [api]
  );

  const addSource = useCallback(
    async (taskId: string, kind: string, url: string) => {
      await callAndCapture(() =>
        api.actions.call("addTaskSource", {
          taskId,
          kind,
          url: url || null,
        })
      );
      await loadTaskDetail(taskId);
    },
    [api, loadTaskDetail]
  );

  const fetchSource = useCallback(
    async (sourceId: string, taskId: string) => {
      await callAndCapture(() =>
        api.actions.call("fetchTaskSource", { sourceId })
      );
      await loadTaskDetail(taskId);
    },
    [api, loadTaskDetail]
  );

  const removeSource = useCallback(
    async (sourceId: string, taskId: string) => {
      await callAndCapture(() =>
        api.actions.call("removeTaskSource", { sourceId })
      );
      await loadTaskDetail(taskId);
    },
    [api, loadTaskDetail]
  );

  return {
    state,
    dispatch,
    loadAll,
    loadStageTasks,
    loadTaskDetail,
    selectTask,
    readPersistedSelection,
    createTask,
    saveTask,
    removeTask,
    runAction,
    openSession,
    addSource,
    fetchSource,
    removeSource,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function MutedText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--tui-text-secondary)" }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600 }}>{children}</div>
  );
}

function PreviewText({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--tui-text-secondary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskSourceCard
// ---------------------------------------------------------------------------

function TaskSourceCard(props: {
  source: TaskSource;
  taskId: string;
  onFetch: (sourceId: string, taskId: string) => void;
  onRemove: (sourceId: string, taskId: string) => void;
}) {
  const { source, taskId } = props;
  return (
    <UICard>
      <div className="tui-col">
        <MutedText>
          {source.kind} &bull; {source.url || "manual"}
        </MutedText>
        {source.content ? (
          <PreviewText>{String(source.content).slice(0, 300)}</PreviewText>
        ) : (
          <MutedText>No content fetched yet.</MutedText>
        )}
        <div className="tui-row">
          <UIButton
            label="Fetch"
            variant="secondary"
            size="sm"
            onClick={() => props.onFetch(source.id, taskId)}
          />
          <UIButton
            label="Remove"
            variant="danger"
            size="sm"
            onClick={() => props.onRemove(source.id, taskId)}
          />
        </div>
      </div>
    </UICard>
  );
}

// ---------------------------------------------------------------------------
// TaskSourcesSection
// ---------------------------------------------------------------------------

function TaskSourcesSection(props: {
  detail: TaskDetail;
  onAddSource: (taskId: string, kind: string, url: string) => void;
  onFetchSource: (sourceId: string, taskId: string) => void;
  onRemoveSource: (sourceId: string, taskId: string) => void;
}) {
  const { detail } = props;
  const [kind, setKind] = useState("manual");
  const [url, setUrl] = useState("");

  const handleAdd = () => {
    props.onAddSource(detail.id, kind, url);
    setUrl("");
  };

  return (
    <UISection title="Sources">
      <div className="tui-col">
        {(detail.sources ?? []).map((source) => (
          <TaskSourceCard
            key={source.id}
            source={source}
            taskId={detail.id}
            onFetch={props.onFetchSource}
            onRemove={props.onRemoveSource}
          />
        ))}
        <UICard>
          <div className="tui-col">
            <SectionTitle>Kind</SectionTitle>
            <UISelect
              options={SOURCE_KIND_OPTIONS}
              value={kind}
              onChange={setKind}
            />
            <SectionTitle>URL</SectionTitle>
            <UIInput
              placeholder="Source URL (optional)"
              value={url}
              onInput={setUrl}
            />
            <UIButton
              label="Add source"
              variant="secondary"
              onClick={handleAdd}
            />
          </div>
        </UICard>
      </div>
    </UISection>
  );
}

// ---------------------------------------------------------------------------
// TaskActionsSection
// ---------------------------------------------------------------------------

function TaskActionsSection(props: {
  detail: TaskDetail;
  onRunAction: (action: "improve" | "plan" | "execute") => void;
  onOpenSession: () => void;
}) {
  const { detail } = props;
  const runSummary = detail.lastRun
    ? `${detail.lastRun.action} \u2022 ${detail.lastRun.status}${detail.lastRun.sessionId ? ` \u2022 ${detail.lastRun.sessionId}` : ""}`
    : "No runs yet.";

  return (
    <UISection title="Actions">
      <UICard>
        <div className="tui-col">
          <div className="tui-row" style={{ flexWrap: "wrap" }}>
            <UIButton
              label="Improve"
              variant="secondary"
              onClick={() => props.onRunAction("improve")}
            />
            <UIButton
              label="Plan"
              variant="secondary"
              onClick={() => props.onRunAction("plan")}
            />
            <UIButton
              label="Execute"
              variant="primary"
              onClick={() => props.onRunAction("execute")}
            />
            <UIButton
              label="Open Session"
              variant="ghost"
              disabled={!detail.lastRun?.sessionId}
              onClick={props.onOpenSession}
            />
          </div>
          <UIBadge
            label={runSummary}
            tone={toneForStatus(detail.lastRun?.status)}
          />
        </div>
      </UICard>
    </UISection>
  );
}

// ---------------------------------------------------------------------------
// TaskDetailView
// ---------------------------------------------------------------------------

function TaskDetailView(props: {
  detail: TaskDetail;
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onRunAction: (action: "improve" | "plan" | "execute") => void;
  onOpenSession: () => void;
  onAddSource: (taskId: string, kind: string, url: string) => void;
  onFetchSource: (sourceId: string, taskId: string) => void;
  onRemoveSource: (sourceId: string, taskId: string) => void;
}) {
  const { detail } = props;
  const [title, setTitle] = useState(detail.title ?? "");
  const [status, setStatus] = useState(String(detail.status ?? "todo"));
  const [notes, setNotes] = useState(detail.notes ?? "");

  // Reset local form state when detail changes
  useEffect(() => {
    setTitle(detail.title ?? "");
    setStatus(String(detail.status ?? "todo"));
    setNotes(detail.notes ?? "");
  }, [detail.id, detail.title, detail.status, detail.notes]);

  return (
    <div className="tui-col">
      <UISection title="Task">
        <UICard>
          <div className="tui-col">
            <SectionTitle>Title</SectionTitle>
            <UIInput
              value={title}
              placeholder="Task title"
              onInput={setTitle}
            />
            <SectionTitle>Status</SectionTitle>
            <UISelect
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <SectionTitle>Notes</SectionTitle>
            <UITextarea
              value={notes}
              rows={8}
              placeholder="Task notes"
              onInput={setNotes}
            />
            <div className="tui-row">
              <UIButton
                label="Save"
                variant="primary"
                onClick={() => props.onSave({ title, notes, status })}
              />
              <UIButton
                label="Delete"
                variant="danger"
                onClick={props.onDelete}
              />
            </div>
          </div>
        </UICard>
      </UISection>

      <TaskSourcesSection
        detail={detail}
        onAddSource={props.onAddSource}
        onFetchSource={props.onFetchSource}
        onRemoveSource={props.onRemoveSource}
      />

      <TaskActionsSection
        detail={detail}
        onRunAction={props.onRunAction}
        onOpenSession={props.onOpenSession}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StageGroup
// ---------------------------------------------------------------------------

function StageGroup(props: {
  stagePath: string;
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelectTask: (taskId: string) => void;
  onCreateTask: () => void;
}) {
  const { stagePath, tasks, selectedTaskId, expanded } = props;
  const stageHasSelection = tasks.some((t) => t.id === selectedTaskId);

  return (
    <UIGroup
      title={stageNameFromPath(stagePath)}
      subtitle={<span className="tui-group-subtitle">{stagePath}</span>}
      meta={
        <UIBadge
          label={`${tasks.length}`}
          tone={tasks.length ? "info" : "neutral"}
        />
      }
      actions={
        expanded ? (
          <UIButton
            label="New"
            variant="ghost"
            size="sm"
            onClick={props.onCreateTask}
          />
        ) : undefined
      }
      active={stageHasSelection}
      expanded={expanded}
      onToggle={props.onToggle}
    >
      {tasks.length ? (
        <UIGroupList>
          {tasks.map((task) => (
            <UIGroupItem
              key={task.id}
              title={task.title || "Untitled"}
              subtitle={task.status || "todo"}
              active={task.id === selectedTaskId}
              onClick={() => props.onSelectTask(task.id)}
            />
          ))}
        </UIGroupList>
      ) : (
        <UIGroupEmpty text="No tasks" />
      )}
    </UIGroup>
  );
}

// ---------------------------------------------------------------------------
// SidebarPanel
// ---------------------------------------------------------------------------

function TasksSidebarPanel() {
  const api = useInstrumentApi();
  const {
    state,
    dispatch,
    loadAll,
    loadStageTasks,
    loadTaskDetail,
    selectTask,
    readPersistedSelection,
    createTask,
  } = useTasksState(api);

  // Initial load
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const firstTask = await loadAll();
      // Restore persisted selection, or auto-select first task
      const persisted = await readPersistedSelection();
      const taskId = persisted || firstTask?.id || null;
      if (taskId) {
        void selectTask(taskId);
      }
    })();
  }, []);

  // Event: tasks changed
  useHostEvent("instrument.event", useCallback(async (payload: InstrumentEventPayload) => {
    if (payload.instrumentId !== api.instrumentId) return;
    if (payload.event === "tasks.changed") {
      const stagePath = String(payload.payload?.stagePath ?? "").trim();
      const taskId = String(payload.payload?.taskId ?? "").trim();
      if (stagePath) {
        await loadStageTasks(stagePath);
      } else {
        await loadAll();
      }
      if (taskId && state.selectedTaskId === taskId) {
        await loadTaskDetail(taskId);
      }
    }
  }, [api, loadStageTasks, loadAll, loadTaskDetail, state.selectedTaskId]));

  // Event: stage added
  useHostEvent("stage.added", useCallback(async () => {
    await loadAll();
  }, [loadAll]));

  // Event: stage removed
  useHostEvent("stage.removed", useCallback(async (payload: StageRemovedPayload) => {
    dispatch({ type: "REMOVE_STAGE", stagePath: payload.path });
    await loadAll();
  }, [dispatch, loadAll]));

  function isStageExpanded(stagePath: string, tasks: TaskSummary[]): boolean {
    const hasSelection = tasks.some((t) => t.id === state.selectedTaskId);
    return (
      state.expandedStagePaths.has(stagePath) ||
      (hasSelection && !state.collapsedStagePaths.has(stagePath))
    );
  }

  function toggleStage(stagePath: string, tasks: TaskSummary[]) {
    const expanded = isStageExpanded(stagePath, tasks);
    if (expanded) {
      dispatch({ type: "COLLAPSE_STAGE", stagePath });
    } else {
      dispatch({ type: "EXPAND_STAGE", stagePath });
    }
  }

  return (
    <UIRoot>
      <div style={{ height: "100%", overflow: "auto", padding: 10, boxSizing: "border-box" }}>
        <UIPanelHeader
          title="Tasks"
          subtitle="Grouped by stage"
          rightActions={
            <UIBadge
              label={`${state.stages.length} stage${state.stages.length === 1 ? "" : "s"}`}
              tone="neutral"
            />
          }
        />

        {state.loading ? (
          <UISection>
            <UICard>
              <MutedText>Loading tasks...</MutedText>
            </UICard>
          </UISection>
        ) : state.stages.length === 0 ? (
          <UISection>
            <UIEmptyState
              title="No stages yet"
              description="Create or open a stage to start using Tasks."
            />
          </UISection>
        ) : (
          <UISection>
            <div className="tui-col">
              {state.stages.map((stagePath) => {
                const tasks = state.tasksByStage[stagePath] ?? [];
                return (
                  <StageGroup
                    key={stagePath}
                    stagePath={stagePath}
                    tasks={tasks}
                    selectedTaskId={state.selectedTaskId}
                    expanded={isStageExpanded(stagePath, tasks)}
                    onToggle={() => toggleStage(stagePath, tasks)}
                    onSelectTask={(taskId) => {
                      dispatch({ type: "EXPAND_STAGE", stagePath });
                      void selectTask(taskId);
                    }}
                    onCreateTask={() => {
                      void createTask(stagePath).then(async () => {
                        const tasks = state.tasksByStage[stagePath] ?? [];
                        const first = tasks[0];
                        if (first?.id) {
                          await selectTask(first.id);
                        }
                      });
                    }}
                  />
                );
              })}
            </div>
          </UISection>
        )}
      </div>
    </UIRoot>
  );
}

// ---------------------------------------------------------------------------
// SecondPanel (detail/main)
// ---------------------------------------------------------------------------

function TasksSecondPanel() {
  const api = useInstrumentApi();
  const {
    state,
    dispatch,
    loadAll,
    loadStageTasks,
    loadTaskDetail,
    readPersistedSelection,
    saveTask,
    removeTask,
    runAction,
    openSession,
    addSource,
    fetchSource,
    removeSource,
  } = useTasksState(api);

  // Initial load
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      await loadAll();
      const persisted = await readPersistedSelection();
      if (persisted) {
        void loadTaskDetail(persisted);
      }
    })();
  }, []);

  // Event: tasks changed + selection sync
  useHostEvent("instrument.event", useCallback(async (payload: InstrumentEventPayload) => {
    if (payload.instrumentId !== api.instrumentId) return;
    if (payload.event === "tasks.changed") {
      const stagePath = String(payload.payload?.stagePath ?? "").trim();
      const taskId = String(payload.payload?.taskId ?? "").trim();
      if (stagePath) {
        await loadStageTasks(stagePath);
      } else {
        await loadAll();
      }
      if (taskId && state.selectedTaskId === taskId) {
        await loadTaskDetail(taskId);
      }
    }
    if (payload.event === "tasks.selection") {
      const taskId = String(payload.payload?.taskId ?? "").trim();
      if (taskId) {
        await loadTaskDetail(taskId);
      } else {
        dispatch({ type: "SET_SELECTED", taskId: null, detail: null });
      }
    }
  }, [api, loadStageTasks, loadAll, loadTaskDetail, state.selectedTaskId, dispatch]));

  // Event: stage added
  useHostEvent("stage.added", useCallback(async () => {
    await loadAll();
  }, [loadAll]));

  // Event: stage removed
  useHostEvent("stage.removed", useCallback(async (payload: StageRemovedPayload) => {
    dispatch({ type: "REMOVE_STAGE", stagePath: payload.path });
    await loadAll();
  }, [dispatch, loadAll]));

  const detail = state.selectedTaskDetail;

  return (
    <UIRoot>
      <div style={{ height: "100%", overflow: "auto", padding: 12, boxSizing: "border-box" }}>
        <UIPanelHeader
          title={detail?.title?.trim() ? detail.title : "Tasks"}
          subtitle={
            detail?.stagePath
              ? stageNameFromPath(detail.stagePath)
              : "Select or create a task"
          }
          rightActions={
            detail?.status ? (
              <UIBadge label={detail.status} tone={toneForStatus(detail.status)} />
            ) : undefined
          }
        />

        {state.error ? (
          <UISection>
            <UICard>
              <div className="tui-row">
                <UIBadge label="Error" tone="danger" />
                <PreviewText>{state.error}</PreviewText>
              </div>
            </UICard>
          </UISection>
        ) : null}

        {!detail ? (
          <UISection>
            <UIEmptyState
              title="Select or create a task"
              description="Pick a task from the sidebar to edit details, sources and actions."
            />
          </UISection>
        ) : (
          <TaskDetailView
            detail={detail}
            onSave={(patch) => {
              void saveTask(detail.id, detail.stagePath, patch);
            }}
            onDelete={() => {
              void removeTask(detail.id, detail.stagePath);
            }}
            onRunAction={(action) => {
              void runAction(detail.id, detail.stagePath, action);
            }}
            onOpenSession={() => {
              void openSession(detail);
            }}
            onAddSource={addSource}
            onFetchSource={fetchSource}
            onRemoveSource={removeSource}
          />
        )}
      </div>
    </UIRoot>
  );
}

// ---------------------------------------------------------------------------
// Instrument definition
// ---------------------------------------------------------------------------

export default defineReactInstrument({
  defaults: {
    visible: {
      sidebar: true,
      first: false,
      second: true,
      right: false,
    },
  },
  panels: {
    sidebar: TasksSidebarPanel,
    second: TasksSecondPanel,
  },
});
