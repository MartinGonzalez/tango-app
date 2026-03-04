/**
 * HTTP server that receives tool approval requests from PreToolUse hook scripts.
 * The hook script POSTs tool details and blocks (long-poll) until the user
 * responds Allow/Deny in the webview.
 */

import { handleDevReload } from "./instruments/dev-server.ts";

export type ToolApprovalRequest = {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
};

type PendingApproval = ToolApprovalRequest & {
  resolve: (response: Response) => void;
};

export type HookEvent = {
  hookEventName: string;
  sessionId: string;
  toolName: string;
  cwd: string;
};

export class ApprovalServer {
  #pending = new Map<string, PendingApproval>();
  #onRequest: ((req: ToolApprovalRequest) => void) | null = null;
  #onHookEvent: ((event: HookEvent) => void) | null = null;
  #server: ReturnType<typeof Bun.serve> | null = null;
  #managedSessions = new Set<string>(); // Session IDs spawned by the app
  #autoAllowSessions = new Set<string>(); // Session IDs with full access enabled

  onApprovalRequest(cb: (req: ToolApprovalRequest) => void): this {
    this.#onRequest = cb;
    return this;
  }

  /** Called for every hook event forwarded from on-hook.sh (PostToolUse, Stop, etc.) */
  onHookEvent(cb: (event: HookEvent) => void): this {
    this.#onHookEvent = cb;
    return this;
  }

  registerSession(sessionId: string, fullAccess = false): void {
    this.#managedSessions.add(sessionId);
    if (fullAccess) {
      this.#autoAllowSessions.add(sessionId);
    } else {
      this.#autoAllowSessions.delete(sessionId);
    }
  }

  setSessionFullAccess(sessionId: string, fullAccess: boolean): void {
    // Treat this as managed if it exists in current app lifecycle.
    this.#managedSessions.add(sessionId);
    if (fullAccess) {
      this.#autoAllowSessions.add(sessionId);
    } else {
      this.#autoAllowSessions.delete(sessionId);
    }
  }

  resolveSessionId(tempId: string, realId: string): void {
    const wasManaged = this.#managedSessions.has(tempId);
    const wasAutoAllow = this.#autoAllowSessions.has(tempId);

    if (wasManaged) this.#managedSessions.delete(tempId);
    if (wasAutoAllow) this.#autoAllowSessions.delete(tempId);

    if (wasManaged) this.#managedSessions.add(realId);
    if (wasAutoAllow) this.#autoAllowSessions.add(realId);
  }

  unregisterSession(sessionId: string): void {
    this.#managedSessions.delete(sessionId);
    this.#autoAllowSessions.delete(sessionId);
  }

  start(port = 4243): void {
    this.#server = Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (req.method === "GET" && url.pathname === "/api/ping") {
          return new Response("pong");
        }

        if (req.method === "POST" && url.pathname === "/api/tool-approve") {
          try {
            const rawBody = await req.text();
            const body = rawBody ? JSON.parse(rawBody) : {};
            const toolUseId = body.tool_use_id ?? "";
            const toolName = body.tool_name ?? "";
            const toolInput = body.tool_input ?? {};
            const sessionId = body.session_id ?? "";

            if (!toolUseId) {
              return new Response(JSON.stringify({ allow: true }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            // If this session is not managed by the app, allow immediately
            if (!this.#managedSessions.has(sessionId)) {
              return new Response(JSON.stringify({ allow: true }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            // Full access session → bypass app approval UI.
            if (this.#autoAllowSessions.has(sessionId)) {
              return new Response(JSON.stringify({ allow: true }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            // Long-poll: return a promise that resolves when the user responds
            return new Promise<Response>((resolveResponse) => {
              // Timeout after 120s — default to allow
              const timeout = setTimeout(() => {
                this.#pending.delete(toolUseId);
                resolveResponse(
                  new Response(JSON.stringify({ allow: true }), {
                    headers: { "Content-Type": "application/json" },
                  })
                );
              }, 120_000);

              this.#pending.set(toolUseId, {
                toolUseId,
                toolName,
                toolInput,
                sessionId,
                resolve: (resp) => {
                  clearTimeout(timeout);
                  resolveResponse(resp);
                },
              });

              // Notify the app
              this.#onRequest?.({ toolUseId, toolName, toolInput, sessionId });
            });
          } catch {
            return new Response(JSON.stringify({ allow: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        // All hook events forwarded from on-hook.sh (fire-and-forget)
        if (req.method === "POST" && url.pathname === "/api/hook-event") {
          try {
            const body = JSON.parse(await req.text());
            const hookEventName = body.hook_event_name ?? "";
            const sessionId = body.session_id ?? "";
            const toolName = body.tool_name ?? "";
            const cwd = body.cwd ?? "";

            const sid = String(sessionId).slice(0, 8);
            const tool = toolName ? ` tool=${toolName}` : "";
            console.log(`\n${"─".repeat(60)}`);
            console.log(`[hook-event] ${hookEventName}${tool} (session: ${sid}…)`);
            console.log(safeStringify(body));

            if (hookEventName) {
              this.#onHookEvent?.({ hookEventName, sessionId, toolName, cwd });
            }
          } catch { /* ignore malformed */ }
          return new Response("ok");
        }

        if (req.method === "POST" && url.pathname === "/api/instruments/dev-reload") {
          return handleDevReload(req);
        }

        return new Response("Not found", { status: 404 });
      },
    });

    console.log(`Approval server listening on port ${port}`);
  }

  respond(toolUseId: string, allow: boolean): void {
    const pending = this.#pending.get(toolUseId);
    if (!pending) return;

    pending.resolve(
      new Response(JSON.stringify({ allow }), {
        headers: { "Content-Type": "application/json" },
      })
    );
    this.#pending.delete(toolUseId);
  }

  stop(): void {
    // Resolve all pending with allow (don't leave hooks hanging)
    for (const [id, pending] of this.#pending) {
      pending.resolve(
        new Response(JSON.stringify({ allow: true }), {
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    this.#pending.clear();
    this.#server?.stop();
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `{"error":"failed_to_serialize_payload","message":${JSON.stringify(message)}}`;
  }
}
