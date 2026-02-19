import type { Snapshot } from "../shared/types.ts";

const DEFAULT_URL = "http://localhost:4242";
const DEFAULT_POLL_MS = 2000;

export class WatcherClient {
  #url: string;
  #pollMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;
  #onSnapshot: ((snapshot: Snapshot) => void) | null = null;
  #onError: ((error: Error) => void) | null = null;

  constructor(opts: { url?: string; pollMs?: number } = {}) {
    this.#url = opts.url ?? DEFAULT_URL;
    this.#pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  }

  onSnapshot(cb: (snapshot: Snapshot) => void): this {
    this.#onSnapshot = cb;
    return this;
  }

  onError(cb: (error: Error) => void): this {
    this.#onError = cb;
    return this;
  }

  start(): void {
    if (this.#timer) return;
    // Fire immediately, then poll
    this.#poll();
    this.#timer = setInterval(() => this.#poll(), this.#pollMs);
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #poll(): Promise<void> {
    try {
      const res = await fetch(`${this.#url}/api/snapshot`);
      if (!res.ok) {
        throw new Error(`Snapshot request failed: ${res.status}`);
      }
      const snapshot: Snapshot = await res.json();
      this.#onSnapshot?.(snapshot);
    } catch (err) {
      this.#onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async isServerUp(): Promise<boolean> {
    try {
      const res = await fetch(`${this.#url}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  get url(): string {
    return this.#url;
  }
}
