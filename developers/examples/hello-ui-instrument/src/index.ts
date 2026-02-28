import {
  defineInstrument,
  type InstrumentFrontendAPI,
} from "@tango/instrument-sdk";
import {
  badge,
  button,
  card,
  createRoot,
  emptyState,
  ensureInstrumentUI,
  list,
  listItem,
  panelHeader,
  section,
} from "@tango/instrument-ui";

type RuntimeMount = {
  sidebarNode: HTMLElement;
  secondNode: HTMLElement;
  deactivate: () => void;
};

let runtime: RuntimeMount | null = null;

function createRuntime(api: InstrumentFrontendAPI): RuntimeMount {
  ensureInstrumentUI();

  const sidebarRoot = createRoot();
  const panelRoot = createRoot();

  const output = document.createElement("pre");
  output.className = "tui-card";
  output.style.whiteSpace = "pre-wrap";
  output.style.wordBreak = "break-word";
  output.textContent = "Ready.";

  const sidebarList = list({
    items: [
      listItem({
        title: "Ping backend",
        subtitle: "Call action from UI",
        onClick: async () => {
          const result = await api.actions.call("ping", { source: "hello-ui" });
          output.textContent = JSON.stringify(result, null, 2);
        },
      }),
      listItem({
        title: "Start session",
        subtitle: "sessions.start() demo",
        onClick: async () => {
          const cwd = await api.stages.active();
          if (!cwd) {
            output.textContent = "No active stage selected.";
            return;
          }
          const result = await api.sessions.start({
            cwd,
            prompt: "Hello from @tango/instrument-ui example",
            fullAccess: true,
          });
          output.textContent = `Started session ${result.sessionId}`;
        },
      }),
    ],
  });

  sidebarRoot.append(
    panelHeader({
      title: "Hello UI",
      subtitle: "instrument-ui primitives",
    }),
    section({
      title: "Actions",
      content: sidebarList,
    })
  );

  panelRoot.append(
    panelHeader({
      title: "Hello from instrument-ui",
      subtitle: "Scoped components using Tango tokens",
      rightActions: [badge({ label: "v2", tone: "info" })],
    }),
    section({
      title: "Demo",
      description: "All widgets below come from @tango/instrument-ui",
      content: card({
        content: [
          button({
            label: "Ping backend",
            variant: "primary",
            onClick: async () => {
              const result = await api.actions.call("ping", { source: "hello-ui-primary" });
              output.textContent = JSON.stringify(result, null, 2);
            },
          }),
        ],
      }),
    }),
    section({
      title: "Output",
      content: output,
    }),
    emptyState({
      title: "Try the sidebar actions",
      description: "Use Ping backend or Start session to validate runtime wiring.",
    })
  );

  const unsubscribeSessionEnded = api.events.subscribe("session.ended", ({ sessionId, exitCode }) => {
    output.textContent = `Session ended: ${sessionId} (exit=${exitCode})`;
  });

  return {
    sidebarNode: sidebarRoot,
    secondNode: panelRoot,
    deactivate: () => {
      unsubscribeSessionEnded();
      sidebarRoot.replaceChildren();
      panelRoot.replaceChildren();
    },
  };
}

function ensureRuntime(api: InstrumentFrontendAPI): RuntimeMount {
  if (!runtime) {
    runtime = createRuntime(api);
  }
  return runtime;
}

export default defineInstrument({
  kind: "tango.instrument.v2",
  defaults: {
    visible: {
      sidebar: true,
      first: false,
      second: true,
      right: false,
    },
  },
  panels: {
    sidebar: ({ api }) => {
      const mounted = ensureRuntime(api);
      return {
        node: mounted.sidebarNode,
        visible: true,
      };
    },
    second: ({ api }) => {
      const mounted = ensureRuntime(api);
      return {
        node: mounted.secondNode,
        visible: true,
      };
    },
  },
  lifecycle: {
    onStop: () => {
      runtime?.deactivate();
      runtime = null;
    },
  },
});
