import {
  ensureInstrumentUI,
  createRoot,
  panelHeader,
  section,
  card,
  button,
  emptyState,
  list,
  listItem,
  badge,
} from "@tango/instrument-ui";

let unsubSessionEnded: (() => void) | null = null;

export function activate(ctx: any): void {
  ensureInstrumentUI();

  const sidebarRoot = createRoot();
  const panelRoot = createRoot();

  const sidebarList = list({
    items: [
      listItem({
        title: "Ping backend",
        subtitle: "Invoke backend method",
        onClick: async () => {
          const result = await ctx.invoke("ping", { source: "hello-ui" });
          output.textContent = JSON.stringify(result, null, 2);
        },
      }),
      listItem({
        title: "Start session",
        subtitle: "sessions.start() demo",
        onClick: async () => {
          const cwd = await ctx.stages.active();
          if (!cwd) {
            output.textContent = "No active stage selected.";
            return;
          }
          const result = await ctx.sessions.start({
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

  const output = document.createElement("pre");
  output.className = "tui-card";
  output.style.whiteSpace = "pre-wrap";
  output.style.wordBreak = "break-word";
  output.textContent = "Ready.";

  panelRoot.append(
    panelHeader({
      title: "Hello from instrument-ui",
      subtitle: "Scoped components using Tango tokens",
      rightActions: [badge({ label: "v1", tone: "info" })],
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
              const result = await ctx.invoke("ping", { source: "hello-ui-primary" });
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

  ctx.panels.mount("sidebar", sidebarRoot);
  ctx.panels.mount("second", panelRoot);
  ctx.panels.setVisible("sidebar", true);
  ctx.panels.setVisible("second", true);

  unsubSessionEnded = ctx.events.subscribe("session.ended", ({ sessionId, exitCode }: any) => {
    output.textContent = `Session ended: ${sessionId} (exit=${exitCode})`;
  });
}

export function deactivate(): void {
  unsubSessionEnded?.();
  unsubSessionEnded = null;
}

export default {
  activate,
  deactivate,
};
