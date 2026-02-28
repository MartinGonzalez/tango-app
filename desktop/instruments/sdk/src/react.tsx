import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
} from "./index.ts";

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
  useEffect(() => {
    return api.events.subscribe(event, handler);
  }, [api, event, handler]);
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
