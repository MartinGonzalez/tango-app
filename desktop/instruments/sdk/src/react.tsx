import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  defineInstrument,
  type HostEventMap,
  type InstrumentFrontendAPI,
  type InstrumentSettingField,
  type TangoInstrumentDefinition,
  type TangoPanelComponent,
  type TangoPanelSlot,
  type UseSessionOptions,
  type UseSessionReturn,
} from "./index.ts";
import type { ContentBlock } from "./types/stream.ts";

const InstrumentApiContext = createContext<InstrumentFrontendAPI | null>(null);
const PanelVisibilityContext = createContext<Partial<Record<TangoPanelSlot, boolean>>>({});

export function InstrumentApiProvider(props: {
  api: InstrumentFrontendAPI;
  panelVisibility?: Partial<Record<TangoPanelSlot, boolean>>;
  children: ReactNode;
}): JSX.Element {
  const panelVisibility = props.panelVisibility ?? {};
  return (
    <InstrumentApiContext.Provider value={props.api}>
      <PanelVisibilityContext.Provider value={panelVisibility}>
        {props.children}
      </PanelVisibilityContext.Provider>
    </InstrumentApiContext.Provider>
  );
}

export function useInstrumentApi(): InstrumentFrontendAPI {
  const api = useContext(InstrumentApiContext);
  if (!api) {
    throw new Error("useInstrumentApi must be used inside InstrumentApiProvider");
  }
  return api;
}

export function useHostEvent<E extends keyof HostEventMap>(
  event: E,
  handler: (payload: HostEventMap[E]) => void | Promise<void>
): void {
  const api = useInstrumentApi();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return api.events.subscribe(event, (payload) => handlerRef.current(payload));
  }, [api, event]);
}

export function usePanelVisibility(): Partial<Record<TangoPanelSlot, boolean>> {
  return useContext(PanelVisibilityContext);
}

export function useInstrumentAction<TInput = Record<string, unknown>, TOutput = unknown>(
  name: string
): (input?: TInput) => Promise<TOutput> {
  const api = useInstrumentApi();
  return useCallback((input?: TInput) => {
    return api.actions.call<TInput, TOutput>(name, input);
  }, [api, name]);
}

export function useInstrumentSettings<T extends Record<string, unknown> = Record<string, unknown>>(): {
  schema: InstrumentSettingField[];
  values: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setValue: (key: string, value: unknown) => Promise<T>;
} {
  const api = useInstrumentApi();
  const [schema, setSchema] = useState<InstrumentSettingField[]>([]);
  const [values, setValues] = useState<T>({} as T);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSchema, nextValues] = await Promise.all([
        api.settings.getSchema(),
        api.settings.getValues<T>(),
      ]);
      setSchema(nextSchema);
      setValues(nextValues);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setValue = useCallback(async (key: string, value: unknown): Promise<T> => {
    const updated = await api.settings.setValue(key, value) as T;
    setValues(updated);
    return updated;
  }, [api]);

  return {
    schema,
    values,
    loading,
    error,
    reload,
    setValue,
  };
}

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function useSession(opts: UseSessionOptions): UseSessionReturn {
  const api = useInstrumentApi();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Captures the sessionId from system.init events that arrive before
  // sessions.start() resolves — prevents dropping early stream events.
  const pendingSessionIdRef = useRef<string | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [response, setResponse] = useState("");
  const responseRef = useRef("");
  const [isResponding, setIsResponding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const persistRef = useRef(opts.persist ?? false);
  persistRef.current = opts.persist ?? false;

  const sidKey = `session.${opts.id}.sid`;
  const userKey = `session.${opts.id}.user`;
  const aiKey = `session.${opts.id}.ai`;

  // Restore from storage on mount
  useEffect(() => {
    if (!persistRef.current) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [sid, user, ai] = await Promise.all([
        api.storage.getProperty<string>(sidKey),
        api.storage.getProperty<string>(userKey),
        api.storage.getProperty<string>(aiKey),
      ]);
      if (cancelled) return;
      if (sid) {
        setSessionId(sid);
        sessionIdRef.current = sid;
      }
      if (user) setUserMessage(user);
      if (ai) {
        setResponse(ai);
        responseRef.current = ai;
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [api, opts.id, opts.persist]);

  const send = useCallback(async (text: string) => {
    setUserMessage(text);
    setResponse("");
    responseRef.current = "";
    setIsResponding(true);

    const cwd = (await api.stages.active()) ?? "/tmp";

    if (persistRef.current) {
      await api.storage.setProperty(userKey, text);
    }

    async function beginNewSession() {
      const { sessionId: newId } = await api.sessions.start({ prompt: text, cwd });
      // If stream events arrived before start() resolved, pendingSessionIdRef
      // already captured the real ID from the system.init event. Adopt it.
      // Don't clear pendingSessionIdRef — later events (result, error) may
      // still reference the temp ID until the session finishes.
      const resolvedId = pendingSessionIdRef.current ?? newId;
      sessionIdRef.current = resolvedId;
      setSessionId(resolvedId);
      if (persistRef.current) {
        await api.storage.setProperty(sidKey, resolvedId);
      }
    }

    if (sessionIdRef.current) {
      try {
        await api.sessions.sendFollowUp({
          sessionId: sessionIdRef.current,
          text,
        });
      } catch {
        // Session no longer exists (e.g. Tango restarted) — start fresh.
        sessionIdRef.current = null;
        pendingSessionIdRef.current = null;
        setSessionId(null);
        await beginNewSession();
      }
    } else {
      await beginNewSession();
    }
  }, [api, sidKey, userKey]);

  const reset = useCallback(async () => {
    sessionIdRef.current = null;
    pendingSessionIdRef.current = null;
    setSessionId(null);
    setUserMessage("");
    setResponse("");
    responseRef.current = "";
    setIsResponding(false);
    if (persistRef.current) {
      await Promise.all([
        api.storage.deleteProperty(sidKey),
        api.storage.deleteProperty(userKey),
        api.storage.deleteProperty(aiKey),
      ]);
    }
  }, [api, sidKey, userKey, aiKey]);

  // Stream handler
  const streamHandler = useCallback((payload: HostEventMap["session.stream"]) => {
    const evt = payload.event;

    // Handle system.init to capture sessionId before sessions.start() resolves.
    // This closes the race where stream events arrive while we're still awaiting start().
    if (evt.type === "system" && evt.subtype === "init" && !sessionIdRef.current) {
      pendingSessionIdRef.current = evt.session_id;
      return;
    }

    // Match against both the confirmed and pending session IDs.
    const ownSession =
      (sessionIdRef.current && payload.sessionId === sessionIdRef.current) ||
      (pendingSessionIdRef.current && payload.sessionId === pendingSessionIdRef.current);
    if (!ownSession) return;

    if (evt.type === "assistant") {
      // Each assistant event is one complete turn (not a delta). We accumulate
      // across turns with += because a session has multiple assistant messages
      // interleaved with tool use.
      const text = extractTextFromBlocks(evt.message.content);
      responseRef.current += text;
      setResponse(responseRef.current);
    } else if (evt.type === "result") {
      setIsResponding(false);
      // Safe to clear pending now — the session is complete.
      pendingSessionIdRef.current = null;
      if (persistRef.current) {
        const sid = sessionIdRef.current;
        void Promise.all([
          api.storage.setProperty(aiKey, responseRef.current),
          sid ? api.storage.setProperty(sidKey, sid) : Promise.resolve(),
        ]);
      }
    } else if (evt.type === "error") {
      setIsResponding(false);
      pendingSessionIdRef.current = null;
    }
  }, [api, aiKey, sidKey]);

  useHostEvent("session.stream", streamHandler);

  // ID resolution handler — don't clear pendingSessionIdRef here because
  // result/error events may still arrive referencing the old temp ID.
  const idResolvedHandler = useCallback((payload: HostEventMap["session.idResolved"]) => {
    if (
      payload.tempId !== sessionIdRef.current &&
      payload.tempId !== pendingSessionIdRef.current
    ) return;
    sessionIdRef.current = payload.realId;
    setSessionId(payload.realId);
    if (persistRef.current) {
      void api.storage.setProperty(sidKey, payload.realId);
    }
  }, [api, sidKey]);

  useHostEvent("session.idResolved", idResolvedHandler);

  // Session ended handler
  const endedHandler = useCallback((payload: HostEventMap["session.ended"]) => {
    if (
      payload.sessionId !== sessionIdRef.current &&
      payload.sessionId !== pendingSessionIdRef.current
    ) return;
    setIsResponding(false);
  }, []);

  useHostEvent("session.ended", endedHandler);

  return { send, reset, userMessage, response, isResponding, sessionId, loaded };
}

type ReactPanelComponent = React.ComponentType<{ api: InstrumentFrontendAPI }>;

type ReactInstrumentDefinition = {
  panels: {
    sidebar?: ReactPanelComponent | null;
    first?: ReactPanelComponent | null;
    second?: ReactPanelComponent | null;
    right?: ReactPanelComponent | null;
  };
  defaults?: TangoInstrumentDefinition["defaults"];
  lifecycle?: TangoInstrumentDefinition["lifecycle"];
};

function renderReactPanel(
  Panel: ReactPanelComponent,
  slot: TangoPanelSlot,
  defaults: ReactInstrumentDefinition["defaults"]
): TangoPanelComponent {
  return ({ api }) => {
    const node = document.createElement("div");
    node.className = "tango-react-panel";
    node.style.overflowY = "auto";
    node.style.height = "100%";

    const root = createRoot(node);
    root.render(
      <InstrumentApiProvider
        api={api}
        panelVisibility={defaults?.visible ?? {}}
      >
        <Panel api={api} />
      </InstrumentApiProvider>
    );

    return {
      node,
      visible: defaults?.visible?.[slot],
      onUnmount: () => {
        root.unmount();
      },
    };
  };
}

export function defineReactInstrument(definition: ReactInstrumentDefinition): TangoInstrumentDefinition {
  return defineInstrument({
    kind: "tango.instrument.v2",
    defaults: definition.defaults,
    lifecycle: definition.lifecycle,
    panels: {
      sidebar: definition.panels.sidebar
        ? renderReactPanel(definition.panels.sidebar, "sidebar", definition.defaults)
        : null,
      first: definition.panels.first
        ? renderReactPanel(definition.panels.first, "first", definition.defaults)
        : null,
      second: definition.panels.second
        ? renderReactPanel(definition.panels.second, "second", definition.defaults)
        : null,
      right: definition.panels.right
        ? renderReactPanel(definition.panels.right, "right", definition.defaults)
        : null,
    },
  });
}

export function reactPanel(
  Component: React.ComponentType<{ api: InstrumentFrontendAPI }>
): TangoPanelComponent {
  return ({ api }) => {
    const node = document.createElement("div");
    node.className = "tango-react-panel";
    node.style.overflowY = "auto";
    node.style.height = "100%";
    const root = createRoot(node);
    root.render(
      <InstrumentApiProvider api={api}>
        <Component api={api} />
      </InstrumentApiProvider>
    );
    return {
      node,
      onUnmount: () => {
        root.unmount();
      },
    };
  };
}

export function useMemoAction<TInput = Record<string, unknown>, TOutput = unknown>(
  name: string
): (input?: TInput) => Promise<TOutput> {
  return useInstrumentAction<TInput, TOutput>(name);
}

export function useHostApiMemo(): InstrumentFrontendAPI {
  const api = useInstrumentApi();
  return useMemo(() => api, [api]);
}
