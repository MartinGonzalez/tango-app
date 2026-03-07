/**
 * Persists user preferences to disk.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".tango", "preferences.json");

type Preferences = {
  preferredOpenApp: string | null;
};

const DEFAULTS: Preferences = {
  preferredOpenApp: null,
};

export class PreferencesStore {
  #prefs: Preferences = { ...DEFAULTS };

  async load(): Promise<void> {
    try {
      const content = await readFile(STORE_PATH, "utf-8");
      this.#prefs = { ...DEFAULTS, ...JSON.parse(content) };
    } catch {
      // File doesn't exist yet
    }
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.#prefs[key];
  }

  async set<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
    this.#prefs[key] = value;
    await this.#save();
  }

  async #save(): Promise<void> {
    await mkdir(join(homedir(), ".tango"), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(this.#prefs, null, 2));
  }
}
