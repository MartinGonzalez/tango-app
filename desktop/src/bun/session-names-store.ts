/**
 * Persists custom session names to disk.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".tango", "session-names.json");

export class SessionNamesStore {
  #names: Record<string, string> = {};

  async load(): Promise<void> {
    try {
      const content = await readFile(STORE_PATH, "utf-8");
      this.#names = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }
  }

  get(sessionId: string): string | null {
    return this.#names[sessionId] ?? null;
  }

  getAll(): Record<string, string> {
    return { ...this.#names };
  }

  async set(sessionId: string, name: string): Promise<void> {
    this.#names[sessionId] = name;
    await this.#save();
  }

  async delete(sessionId: string): Promise<void> {
    if (!(sessionId in this.#names)) return;
    delete this.#names[sessionId];
    await this.#save();
  }

  async #save(): Promise<void> {
    await mkdir(join(homedir(), ".tango"), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(this.#names, null, 2));
  }
}
