import { homedir } from "node:os";

type PtyDataHandler = (id: string, data: string) => void;
type PtyExitHandler = (id: string, exitCode: number) => void;

type PtySession = {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
};

export class PtyManager {
  #sessions = new Map<string, PtySession>();
  #onData: PtyDataHandler | null = null;
  #onExit: PtyExitHandler | null = null;

  onData(cb: PtyDataHandler): this {
    this.#onData = cb;
    return this;
  }

  onExit(cb: PtyExitHandler): this {
    this.#onExit = cb;
    return this;
  }

  spawn(
    id: string,
    cwd: string,
    cols: number = 80,
    rows: number = 24,
    sessionId?: string,
    newSessionId?: string,
  ): void {
    this.kill(id);

    const shell = process.env.SHELL || "/bin/zsh";

    const proc = Bun.spawn([shell, "-l"], {
      cwd: cwd || homedir(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      terminal: {
        cols,
        rows,
        data: (_terminal: unknown, data: Buffer) => {
          // Base64-encode to safely transport through JSON RPC
          const b64 = Buffer.from(data).toString("base64");
          this.#onData?.(id, b64);
        },
        exit: () => {
          this.#sessions.delete(id);
          this.#onExit?.(id, 0);
        },
      },
    });

    this.#sessions.set(id, { id, proc });

    // Auto-start claude: resume existing session or start new with known ID
    setTimeout(() => {
      if (this.#sessions.has(id)) {
        let cmd: string;
        if (sessionId) {
          cmd = `claude --resume ${sessionId}`;
        } else if (newSessionId) {
          cmd = `claude --session-id ${newSessionId}`;
        } else {
          cmd = `claude`;
        }
        proc.terminal.write(`${cmd}\n`);
      }
    }, 500);
  }

  write(id: string, data: string): void {
    this.#sessions.get(id)?.proc.terminal.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.#sessions.get(id)?.proc.terminal.resize(cols, rows);
  }

  kill(id: string): void {
    const session = this.#sessions.get(id);
    if (session) {
      session.proc.terminal.close();
      this.#sessions.delete(id);
    }
  }

  killAll(): void {
    for (const session of this.#sessions.values()) {
      session.proc.terminal.close();
    }
    this.#sessions.clear();
  }
}
