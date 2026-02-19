import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const DEFAULT_FILE = join(homedir(), ".claude-sessions", "workspaces.json");
const MAX_WORKSPACES = 20;

export class WorkspaceStore {
  #workspaces: string[] = [];
  #loaded = false;
  #filePath: string;

  constructor(filePath?: string) {
    this.#filePath = filePath ?? DEFAULT_FILE;
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    try {
      const raw = await readFile(this.#filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.#workspaces = data.filter((w: unknown) => typeof w === "string");
      }
    } catch {
      // File doesn't exist or is malformed — start fresh
      this.#workspaces = [];
    }
    this.#loaded = true;
  }

  getAll(): string[] {
    return [...this.#workspaces];
  }

  async add(path: string): Promise<void> {
    await this.load();
    // Move to front if already exists, otherwise prepend
    this.#workspaces = [path, ...this.#workspaces.filter((w) => w !== path)];
    if (this.#workspaces.length > MAX_WORKSPACES) {
      this.#workspaces = this.#workspaces.slice(0, MAX_WORKSPACES);
    }
    await this.#save();
  }

  async remove(path: string): Promise<void> {
    await this.load();
    this.#workspaces = this.#workspaces.filter((w) => w !== path);
    await this.#save();
  }

  async #save(): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(this.#workspaces, null, 2));
  }
}
