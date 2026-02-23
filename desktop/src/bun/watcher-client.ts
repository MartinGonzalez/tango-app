import type { Snapshot } from "../shared/types.ts";

const DEFAULT_URL = "http://127.0.0.1:4242";
const FALLBACK_URL = "http://localhost:4242";
const DEFAULT_POLL_MS = 2000;

export class WatcherClient {
  #urls: string[];
  #pollMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;
  #onSnapshot: ((snapshot: Snapshot) => void) | null = null;
  #onError: ((error: Error) => void) | null = null;
  #lastErrorMessage: string | null = null;

  constructor(opts: { url?: string; pollMs?: number } = {}) {
    const primary = (opts.url ?? DEFAULT_URL).trim().replace(/\/+$/, "");
    this.#urls = [primary];
    if (!opts.url && primary !== FALLBACK_URL) {
      this.#urls.push(FALLBACK_URL);
    }
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
      const res = await this.#fetchFromAny("/api/snapshot");
      if (!res.ok) {
        throw new Error(`Snapshot request failed: ${res.status}`);
      }
      const snapshot: Snapshot = await res.json();
      this.#lastErrorMessage = null;
      this.#onSnapshot?.(snapshot);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message !== this.#lastErrorMessage) {
        this.#lastErrorMessage = error.message;
        this.#onError?.(error);
      }
    }
  }

  async isServerUp(): Promise<boolean> {
    try {
      const res = await this.#fetchFromAny("/health");
      return res.ok;
    } catch {
      return false;
    }
  }

  async #fetchFromAny(path: string): Promise<Response> {
    let lastError: unknown = null;
    for (const url of this.#urls) {
      try {
        return await fetch(`${url}${path}`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Watcher server unavailable");
  }

  get url(): string {
    return this.#urls[0];
  }
}
