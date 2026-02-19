import type { ClaudeStreamEvent } from "../shared/types.ts";

export type SessionProcess = {
  sessionId: string | null;
  proc: ReturnType<typeof Bun.spawn>;
  cwd: string;
  startedAt: string;
};

type SessionEventHandler = (sessionId: string, event: ClaudeStreamEvent) => void;
type SessionEndHandler = (sessionId: string, exitCode: number) => void;
type SessionErrorHandler = (sessionId: string, error: string) => void;
type SessionIdResolvedHandler = (tempId: string, realId: string) => void;

export class SessionManager {
  #sessions = new Map<string, SessionProcess>();
  #onEvent: SessionEventHandler | null = null;
  #onEnd: SessionEndHandler | null = null;
  #onError: SessionErrorHandler | null = null;
  #onIdResolved: SessionIdResolvedHandler | null = null;

  onEvent(cb: SessionEventHandler): this {
    this.#onEvent = cb;
    return this;
  }

  onEnd(cb: SessionEndHandler): this {
    this.#onEnd = cb;
    return this;
  }

  onIdResolved(cb: SessionIdResolvedHandler): this {
    this.#onIdResolved = cb;
    return this;
  }

  onError(cb: SessionErrorHandler): this {
    this.#onError = cb;
    return this;
  }

  /**
   * Spawn a new Claude session using bidirectional stream-json mode.
   * The process stays alive for multi-turn conversation — send follow-up
   * prompts with sendMessage().
   */
  async spawn(
    prompt: string,
    cwd: string,
    fullAccess: boolean = true,
    resumeSessionId?: string
  ): Promise<string> {
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ];

    if (fullAccess) {
      args.push("--dangerously-skip-permissions");
    }

    if (resumeSessionId) {
      args.push("--resume", resumeSessionId);
    }

    let proc;
    try {
      proc = Bun.spawn(["claude", ...args], {
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to spawn claude: ${msg}`);
    }

    const tempId = resumeSessionId ?? crypto.randomUUID();
    const session: SessionProcess = {
      sessionId: tempId,
      proc,
      cwd,
      startedAt: new Date().toISOString(),
    };

    this.#sessions.set(tempId, session);
    this.#readStream(tempId, proc);
    this.#readStderr(tempId, proc);

    // Send the initial prompt as a stream-json user message
    await this.#writeToProc(proc, {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    });

    return tempId;
  }

  /**
   * Send a follow-up message to an active session.
   */
  async sendMessage(sessionId: string, text: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new Error(`No active session: ${sessionId}`);
    }

    await this.#writeToProc(session.proc, {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text }],
      },
    });
  }

  /**
   * Send a permission response to an active session.
   */
  async respondPermission(
    sessionId: string,
    toolUseId: string,
    allow: boolean
  ): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new Error(`No active session: ${sessionId}`);
    }

    await this.#writeToProc(session.proc, {
      type: "permission_response",
      permission: allow ? "allow" : "deny",
      tool_use_id: toolUseId,
    });
  }

  kill(sessionId: string): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;
    try { (session.proc.stdin as any)?.end?.(); } catch {}
    session.proc.kill();
    this.#sessions.delete(sessionId);
    return true;
  }

  getActive(): string[] {
    return Array.from(this.#sessions.keys());
  }

  isAppSpawned(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  async #writeToProc(
    proc: ReturnType<typeof Bun.spawn>,
    data: unknown
  ): Promise<void> {
    const stdin = proc.stdin;
    if (!stdin || typeof stdin === "number") return;
    const json = JSON.stringify(data) + "\n";
    // Bun.spawn stdin is a FileSink — use .write() directly
    (stdin as any).write(json);
    (stdin as any).flush?.();
  }

  async #readStream(tempId: string, proc: ReturnType<typeof Bun.spawn>): Promise<void> {
    if (!proc.stdout || typeof proc.stdout === "number") return;
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let resolvedSessionId = tempId;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed) as ClaudeStreamEvent;
            const eventType = `${(event as any).type}/${(event as any).subtype ?? ""}`;
            console.log(`[session-stream] ${eventType}`, trimmed.slice(0, 200));
            if ((event as any).type === "user" || (event as any).type === "assistant") {
              console.log("[session-stream-full]");
              console.log(safeStringify(event));
            }

            // Resolve session ID from first init event
            if (event.type === "system" && event.subtype === "init" && event.session_id) {
              const realId = event.session_id;
              if (realId !== tempId && resolvedSessionId === tempId) {
                const session = this.#sessions.get(tempId);
                if (session) {
                  session.sessionId = realId;
                  this.#sessions.delete(tempId);
                  this.#sessions.set(realId, session);
                  resolvedSessionId = realId;
                  this.#onIdResolved?.(tempId, realId);
                }
              }
            }

            this.#onEvent?.(resolvedSessionId, event);
          } catch (e) {
            console.warn("[session-manager] Malformed JSON line:", trimmed.slice(0, 100));
          }
        }
      }
    } catch (e) {
      console.error("[session-manager] Stream read error:", e);
    }

    const exitCode = await proc.exited;
    this.#sessions.delete(resolvedSessionId);
    this.#onEnd?.(resolvedSessionId, exitCode);
  }

  async #readStderr(tempId: string, proc: ReturnType<typeof Bun.spawn>): Promise<void> {
    if (!proc.stderr || typeof proc.stderr === "number") return;
    try {
      const text = await new Response(proc.stderr as ReadableStream).text();
      if (text.trim()) {
        console.error(`[session-manager] stderr (${tempId}):`, text.trim());
        this.#onError?.(tempId, text.trim());
      }
    } catch {
      // stderr read failed — not critical
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `{"error":"failed_to_serialize","message":${JSON.stringify(message)}}`;
  }
}
