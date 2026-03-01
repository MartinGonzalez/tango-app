import { describe, expect, test, beforeEach, mock } from "bun:test";
import React, { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { parseHTML } from "linkedom";
import { InstrumentApiProvider } from "../src/react.tsx";
import { useSession } from "../src/react.tsx";
import type {
  InstrumentFrontendAPI,
  HostEventMap,
} from "../src/types/instrument-sdk.ts";
import type { ContentBlock } from "../src/types/stream.ts";

// --- DOM setup via linkedom ---
const { document, window } = parseHTML("<!DOCTYPE html><html><body></body></html>");
(globalThis as any).document = document;
(globalThis as any).window = window;
(globalThis as any).navigator = window.navigator;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mock API factory ---
type EventHandler = (payload: any) => void | Promise<void>;

function createMockApi(storageData: Record<string, unknown> = {}) {
  const subscriptions = new Map<string, Set<EventHandler>>();

  const api: InstrumentFrontendAPI = {
    instrumentId: "test",
    permissions: [],
    storage: {
      getProperty: mock(async <T = unknown>(key: string): Promise<T | null> => {
        return (storageData[key] as T) ?? null;
      }),
      setProperty: mock(async (key: string, value: unknown): Promise<void> => {
        storageData[key] = value;
      }),
      deleteProperty: mock(async (key: string): Promise<void> => {
        delete storageData[key];
      }),
      readFile: mock(async () => ""),
      writeFile: mock(async () => {}),
      deleteFile: mock(async () => {}),
      listFiles: mock(async () => []),
      sqlQuery: mock(async () => []),
      sqlExecute: mock(async () => ({ changes: 0, lastInsertRowid: null })),
    },
    sessions: {
      start: mock(async (params: any) => ({ sessionId: "real-session-1" })),
      sendFollowUp: mock(async () => {}),
      kill: mock(async () => {}),
      list: mock(async () => []),
      focus: mock(async () => {}),
      query: mock(async () => ({ text: "", durationMs: 0, costUsd: 0 })),
    },
    connectors: {
      listStageConnectors: mock(async () => []),
      isAuthorized: mock(async () => false),
      connect: mock(async () => ({} as any)),
      disconnect: mock(async () => {}),
      getCredential: mock(async () => ({} as any)),
    },
    stages: {
      list: mock(async () => ["/test/project"]),
      active: mock(async () => "/test/project"),
    },
    events: {
      subscribe: mock(<E extends keyof HostEventMap>(
        event: E,
        handler: (payload: HostEventMap[E]) => void | Promise<void>
      ): (() => void) => {
        if (!subscriptions.has(event)) subscriptions.set(event, new Set());
        subscriptions.get(event)!.add(handler as EventHandler);
        return () => {
          subscriptions.get(event)?.delete(handler as EventHandler);
        };
      }),
    },
    actions: {
      call: mock(async () => undefined as any),
    },
    settings: {
      getSchema: mock(async () => []),
      getValues: mock(async () => ({} as any)),
      setValue: mock(async () => ({} as any)),
    },
    registerShortcut: mock(() => {}),
    emit: mock(() => {}),
  };

  function emit<E extends keyof HostEventMap>(event: E, payload: HostEventMap[E]) {
    const handlers = subscriptions.get(event);
    if (handlers) {
      for (const handler of handlers) handler(payload);
    }
  }

  return { api, emit, storageData };
}

// --- Test harness to render hook and capture values ---
type HookResult = ReturnType<typeof useSession>;

function renderHook(
  api: InstrumentFrontendAPI,
  opts: { id: string; persist?: boolean }
) {
  let result: HookResult = null as any;
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;

  function TestComponent() {
    result = useSession(opts);
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(
      <InstrumentApiProvider api={api}>
        <TestComponent />
      </InstrumentApiProvider>
    );
  });

  return {
    get current() {
      return result;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

// --- Helpers ---
function textBlock(text: string): ContentBlock {
  return { type: "text", text };
}

function flushMicrotasks() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// --- Tests ---
describe("useSession", () => {
  test("loaded starts false then becomes true after mount", async () => {
    const { api } = createMockApi();
    const hook = renderHook(api, { id: "chat" });

    // After synchronous render, loaded may be false
    // After effects flush, it should be true (persist defaults to false)
    await flushMicrotasks();
    expect(hook.current.loaded).toBe(true);
    hook.unmount();
  });

  test("persist: false sets loaded immediately without storage calls", async () => {
    const { api } = createMockApi();
    const hook = renderHook(api, { id: "chat", persist: false });

    await flushMicrotasks();
    expect(hook.current.loaded).toBe(true);
    expect(api.storage.getProperty).not.toHaveBeenCalled();
    hook.unmount();
  });

  test("persist: true restores sessionId, userMessage, and response from storage", async () => {
    const { api } = createMockApi({
      "session.chat.sid": "saved-session-42",
      "session.chat.user": "hello",
      "session.chat.ai": "hi there",
    });
    const hook = renderHook(api, { id: "chat", persist: true });

    await flushMicrotasks();
    expect(hook.current.loaded).toBe(true);
    expect(hook.current.sessionId).toBe("saved-session-42");
    expect(hook.current.userMessage).toBe("hello");
    expect(hook.current.response).toBe("hi there");
    hook.unmount();
  });

  test("send() starts a new session when no sessionId exists", async () => {
    const { api } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("build something");
    });

    expect(api.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "build something",
        cwd: "/test/project",
      })
    );
    expect(hook.current.sessionId).toBe("real-session-1");
    hook.unmount();
  });

  test("send() calls sendFollowUp when sessionId already exists", async () => {
    const { api } = createMockApi({
      "session.chat.sid": "existing-session",
    });
    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    expect(hook.current.sessionId).toBe("existing-session");

    await act(async () => {
      await hook.current.send("follow up question");
    });

    expect(api.sessions.sendFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "existing-session",
        text: "follow up question",
      })
    );
    expect(api.sessions.start).not.toHaveBeenCalled();
    hook.unmount();
  });

  test("send() sets isResponding and clears response", async () => {
    const { api } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });

    expect(hook.current.isResponding).toBe(true);
    expect(hook.current.userMessage).toBe("go");
    expect(hook.current.response).toBe("");
    hook.unmount();
  });

  test("stream events accumulate response text", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    // Start a session first
    await act(async () => {
      await hook.current.send("go");
    });

    // Simulate stream events
    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            content: [textBlock("Hello ")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "real-session-1",
          parent_tool_use_id: null,
        },
      });
    });

    expect(hook.current.response).toBe("Hello ");

    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "assistant",
          message: {
            id: "msg-2",
            role: "assistant",
            content: [textBlock("world!")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "real-session-1",
          parent_tool_use_id: null,
        },
      });
    });

    expect(hook.current.response).toBe("Hello world!");
    hook.unmount();
  });

  test("result event sets isResponding to false", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });
    expect(hook.current.isResponding).toBe(true);

    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          session_id: "real-session-1",
          duration_ms: 100,
          total_cost_usd: 0.01,
          num_turns: 1,
        },
      });
    });

    expect(hook.current.isResponding).toBe(false);
    hook.unmount();
  });

  test("ID resolution updates sessionId", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });
    expect(hook.current.sessionId).toBe("real-session-1");

    await act(async () => {
      emit("session.idResolved", {
        tempId: "real-session-1",
        realId: "resolved-session-99",
      });
    });

    expect(hook.current.sessionId).toBe("resolved-session-99");
    hook.unmount();
  });

  test("stream events for different session are ignored", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });

    await act(async () => {
      emit("session.stream", {
        sessionId: "other-session",
        event: {
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            content: [textBlock("should be ignored")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "other-session",
          parent_tool_use_id: null,
        },
      });
    });

    expect(hook.current.response).toBe("");
    hook.unmount();
  });

  test("persist: true writes to storage on result", async () => {
    const { api, emit, storageData } = createMockApi();
    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });

    // Stream some content
    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            content: [textBlock("final answer")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "real-session-1",
          parent_tool_use_id: null,
        },
      });
    });

    // Result event triggers persist
    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          session_id: "real-session-1",
          duration_ms: 100,
          total_cost_usd: 0.01,
          num_turns: 1,
        },
      });
    });
    await flushMicrotasks();

    // Check that storage was written
    expect(storageData["session.chat.ai"]).toBe("final answer");
    expect(storageData["session.chat.sid"]).toBe("real-session-1");
    hook.unmount();
  });

  test("session.ended sets isResponding to false", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });
    expect(hook.current.isResponding).toBe(true);

    await act(async () => {
      emit("session.ended", {
        sessionId: "real-session-1",
        exitCode: 0,
      });
    });

    expect(hook.current.isResponding).toBe(false);
    hook.unmount();
  });

  test("error event sets isResponding to false", async () => {
    const { api, emit } = createMockApi();
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });
    expect(hook.current.isResponding).toBe(true);

    await act(async () => {
      emit("session.stream", {
        sessionId: "real-session-1",
        event: {
          type: "error",
          error: { message: "something broke" },
          session_id: "real-session-1",
        },
      });
    });

    expect(hook.current.isResponding).toBe(false);
    hook.unmount();
  });

  test("persist: true writes userMessage to storage on send", async () => {
    const { api, storageData } = createMockApi();
    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("my question");
    });

    expect(storageData["session.chat.user"]).toBe("my question");
    hook.unmount();
  });

  test("persist: true writes sessionId on ID resolution", async () => {
    const { api, emit, storageData } = createMockApi();
    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });

    await act(async () => {
      emit("session.idResolved", {
        tempId: "real-session-1",
        realId: "resolved-99",
      });
    });
    await flushMicrotasks();

    expect(storageData["session.chat.sid"]).toBe("resolved-99");
    hook.unmount();
  });

  test("stages.active fallback when no active stage", async () => {
    const { api } = createMockApi();
    (api.stages.active as any).mockImplementation(async () => null);
    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.send("go");
    });

    expect(api.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/tmp",
      })
    );
    hook.unmount();
  });

  test("stream events arriving before sessions.start resolves are not dropped", async () => {
    const { api, emit } = createMockApi();

    // Make sessions.start hang until we resolve it manually
    let resolveStart!: (value: { sessionId: string }) => void;
    (api.sessions.start as any).mockImplementation(
      () => new Promise((resolve) => { resolveStart = resolve; })
    );

    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    // Start send() — it will await sessions.start() which hangs
    let sendDone = false;
    act(() => {
      hook.current.send("go").then(() => { sendDone = true; });
    });
    await flushMicrotasks();

    // Stream events arrive BEFORE sessions.start resolves
    // First: system.init reveals the session ID
    await act(async () => {
      emit("session.stream", {
        sessionId: "early-session",
        event: {
          type: "system",
          subtype: "init",
          session_id: "early-session",
        },
      });
    });

    // Then: assistant content arrives
    await act(async () => {
      emit("session.stream", {
        sessionId: "early-session",
        event: {
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            content: [textBlock("early response")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "early-session",
          parent_tool_use_id: null,
        },
      });
    });

    // The response should have been captured, not dropped
    expect(hook.current.response).toBe("early response");

    // Now resolve sessions.start
    await act(async () => {
      resolveStart({ sessionId: "early-session" });
    });
    await flushMicrotasks();

    // sessionId should be set correctly
    expect(hook.current.sessionId).toBe("early-session");
    expect(sendDone).toBe(true);
    hook.unmount();
  });

  test("pendingSessionIdRef adopts early ID even if start returns different temp ID", async () => {
    const { api, emit } = createMockApi();

    let resolveStart!: (value: { sessionId: string }) => void;
    (api.sessions.start as any).mockImplementation(
      () => new Promise((resolve) => { resolveStart = resolve; })
    );

    const hook = renderHook(api, { id: "chat" });
    await flushMicrotasks();

    act(() => {
      hook.current.send("go");
    });
    await flushMicrotasks();

    // system.init arrives with the real session ID
    await act(async () => {
      emit("session.stream", {
        sessionId: "real-from-stream",
        event: {
          type: "system",
          subtype: "init",
          session_id: "real-from-stream",
        },
      });
    });

    // sessions.start resolves with a different (temp) ID
    await act(async () => {
      resolveStart({ sessionId: "temp-from-start" });
    });
    await flushMicrotasks();

    // Hook should prefer the ID captured from the stream (real-from-stream)
    expect(hook.current.sessionId).toBe("real-from-stream");
    hook.unmount();
  });

  test("result event persists AI response even after idResolved clears temp ID", async () => {
    const { api, emit, storageData } = createMockApi();

    let resolveStart!: (value: { sessionId: string }) => void;
    (api.sessions.start as any).mockImplementation(
      () => new Promise((resolve) => { resolveStart = resolve; })
    );

    const hook = renderHook(api, { id: "minichat", persist: true });
    await flushMicrotasks();

    // 1. send() kicks off sessions.start (hangs)
    act(() => {
      hook.current.send("hello");
    });
    await flushMicrotasks();

    // 2. system.init arrives with temp ID
    await act(async () => {
      emit("session.stream", {
        sessionId: "temp-abc",
        event: {
          type: "system",
          subtype: "init",
          session_id: "temp-abc",
        },
      });
    });

    // 3. assistant event arrives (still using temp ID)
    await act(async () => {
      emit("session.stream", {
        sessionId: "temp-abc",
        event: {
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            content: [textBlock("the AI answer")],
            model: "claude-sonnet-4-5-20250929",
            stop_reason: null,
          },
          session_id: "temp-abc",
          parent_tool_use_id: null,
        },
      });
    });
    expect(hook.current.response).toBe("the AI answer");

    // 4. sessions.start resolves
    await act(async () => {
      resolveStart({ sessionId: "temp-abc" });
    });
    await flushMicrotasks();

    // 5. idResolved fires — temp-abc → real-xyz
    await act(async () => {
      emit("session.idResolved", {
        tempId: "temp-abc",
        realId: "real-xyz",
      });
    });
    await flushMicrotasks();

    expect(hook.current.sessionId).toBe("real-xyz");

    // 6. result event arrives — still referencing "temp-abc"
    //    BUG: without fix, this is dropped because pendingSessionIdRef was
    //    cleared by idResolved and sessionIdRef is now "real-xyz"
    await act(async () => {
      emit("session.stream", {
        sessionId: "temp-abc",
        event: {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          session_id: "temp-abc",
          duration_ms: 100,
          total_cost_usd: 0.01,
          num_turns: 1,
        },
      });
    });
    await flushMicrotasks();

    // The AI response must have been persisted
    expect(hook.current.isResponding).toBe(false);
    expect(storageData["session.minichat.ai"]).toBe("the AI answer");
    expect(storageData["session.minichat.sid"]).toBe("real-xyz");
    hook.unmount();
  });

  test("stale session ID falls back to sessions.start when sendFollowUp rejects", async () => {
    const { api } = createMockApi({
      "session.chat.sid": "stale-session-from-last-run",
      "session.chat.user": "old prompt",
      "session.chat.ai": "old response",
    });

    // sendFollowUp rejects for the stale session
    (api.sessions.sendFollowUp as any).mockImplementation(async () => {
      throw new Error("No active session: stale-session-from-last-run");
    });

    // sessions.start succeeds with a fresh ID
    (api.sessions.start as any).mockImplementation(async () => ({
      sessionId: "fresh-session-99",
    }));

    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    expect(hook.current.sessionId).toBe("stale-session-from-last-run");

    // send() should catch the sendFollowUp error and fall back to start()
    await act(async () => {
      await hook.current.send("new prompt");
    });

    expect(api.sessions.sendFollowUp).toHaveBeenCalledTimes(1);
    expect(api.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "new prompt",
        cwd: "/test/project",
      })
    );
    expect(hook.current.sessionId).toBe("fresh-session-99");
    expect(hook.current.isResponding).toBe(true);
    hook.unmount();
  });

  test("reset() clears all state and persisted storage", async () => {
    const { api, storageData } = createMockApi({
      "session.chat.sid": "active-session",
      "session.chat.user": "hello",
      "session.chat.ai": "world",
    });

    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    expect(hook.current.sessionId).toBe("active-session");
    expect(hook.current.userMessage).toBe("hello");
    expect(hook.current.response).toBe("world");

    await act(async () => {
      await hook.current.reset();
    });

    expect(hook.current.sessionId).toBe(null);
    expect(hook.current.userMessage).toBe("");
    expect(hook.current.response).toBe("");
    expect(hook.current.isResponding).toBe(false);

    // Storage should be cleared
    expect(storageData["session.chat.sid"]).toBeUndefined();
    expect(storageData["session.chat.user"]).toBeUndefined();
    expect(storageData["session.chat.ai"]).toBeUndefined();

    hook.unmount();
  });

  test("reset() without persist only clears in-memory state", async () => {
    const { api } = createMockApi();
    const hook = renderHook(api, { id: "chat", persist: false });
    await flushMicrotasks();

    // Start a session so there's state to clear
    await act(async () => {
      await hook.current.send("go");
    });
    expect(hook.current.sessionId).toBe("real-session-1");
    expect(hook.current.isResponding).toBe(true);

    await act(async () => {
      await hook.current.reset();
    });

    expect(hook.current.sessionId).toBe(null);
    expect(hook.current.userMessage).toBe("");
    expect(hook.current.response).toBe("");
    expect(hook.current.isResponding).toBe(false);
    expect(api.storage.deleteProperty).not.toHaveBeenCalled();
    hook.unmount();
  });

  test("send() works after reset() to start a fresh session", async () => {
    const { api, storageData } = createMockApi({
      "session.chat.sid": "old-session",
      "session.chat.user": "old",
      "session.chat.ai": "old response",
    });

    const hook = renderHook(api, { id: "chat", persist: true });
    await flushMicrotasks();

    await act(async () => {
      await hook.current.reset();
    });

    // Now send a new message — should call sessions.start, not sendFollowUp
    await act(async () => {
      await hook.current.send("fresh start");
    });

    expect(api.sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "fresh start" })
    );
    expect(api.sessions.sendFollowUp).not.toHaveBeenCalled();
    expect(hook.current.sessionId).toBe("real-session-1");
    expect(hook.current.userMessage).toBe("fresh start");
    hook.unmount();
  });
});
