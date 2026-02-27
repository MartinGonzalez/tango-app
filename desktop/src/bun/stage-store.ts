import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const DEFAULT_FILE = join(homedir(), ".tango", "stages.json");
const MAX_STAGES = 20;

export class StageStore {
  #stages: string[] = [];
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
        this.#stages = data.filter((w: unknown) => typeof w === "string");
      }
    } catch {
      // File doesn't exist or is malformed — start fresh
      this.#stages = [];
    }
    this.#loaded = true;
  }

  getAll(): string[] {
    return [...this.#stages];
  }

  async add(path: string): Promise<void> {
    await this.load();
    // Move to front if already exists, otherwise prepend
    this.#stages = [path, ...this.#stages.filter((w) => w !== path)];
    if (this.#stages.length > MAX_STAGES) {
      this.#stages = this.#stages.slice(0, MAX_STAGES);
    }
    await this.#save();
  }

  async remove(path: string): Promise<void> {
    await this.load();
    this.#stages = this.#stages.filter((w) => w !== path);
    await this.#save();
  }

  async #save(): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(this.#stages, null, 2));
  }
}
