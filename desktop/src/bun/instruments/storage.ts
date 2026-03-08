import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { KeychainStore } from "../keychain-store.ts";

type SqlResult = {
  changes: number;
  lastInsertRowid: number | null;
};

const INSTRUMENTS_HOME = join(homedir(), ".tango", "instruments");
const SETTINGS_KEYCHAIN_SERVICE = "dev.tango.app.instruments.settings";

export class InstrumentStorage {
  #keychain: KeychainStore;

  constructor(opts?: { keychain?: KeychainStore }) {
    this.#keychain = opts?.keychain ?? new KeychainStore();
  }

  instrumentRoot(instrumentId: string): string {
    return join(INSTRUMENTS_HOME, "data", instrumentId);
  }

  propertiesPath(instrumentId: string): string {
    return join(this.instrumentRoot(instrumentId), "properties.json");
  }

  filesRoot(instrumentId: string): string {
    return join(this.instrumentRoot(instrumentId), "files");
  }

  dbRoot(instrumentId: string): string {
    return join(this.instrumentRoot(instrumentId), "db");
  }

  async deleteInstrumentData(instrumentId: string): Promise<void> {
    const root = this.instrumentRoot(instrumentId);
    await rm(root, { recursive: true, force: true });
  }

  async getSettingProperty(
    instrumentId: string,
    key: string
  ): Promise<unknown | null> {
    return this.getProperty(instrumentId, `settings.${key}`);
  }

  async setSettingProperty(
    instrumentId: string,
    key: string,
    value: unknown
  ): Promise<void> {
    await this.setProperty(instrumentId, `settings.${key}`, value);
  }

  async deleteSettingProperty(
    instrumentId: string,
    key: string
  ): Promise<void> {
    await this.deleteProperty(instrumentId, `settings.${key}`);
  }

  async getSettingSecret(
    instrumentId: string,
    key: string
  ): Promise<string | null> {
    const account = this.#settingSecretAccount(instrumentId, key);
    return this.#keychain.getSecret(SETTINGS_KEYCHAIN_SERVICE, account);
  }

  async setSettingSecret(
    instrumentId: string,
    key: string,
    value: string
  ): Promise<void> {
    const account = this.#settingSecretAccount(instrumentId, key);
    await this.#keychain.setSecret(SETTINGS_KEYCHAIN_SERVICE, account, value);
  }

  async deleteSettingSecret(
    instrumentId: string,
    key: string
  ): Promise<void> {
    const account = this.#settingSecretAccount(instrumentId, key);
    await this.#keychain.deleteSecret(SETTINGS_KEYCHAIN_SERVICE, account);
  }

  async getProperty(
    instrumentId: string,
    key: string
  ): Promise<unknown | null> {
    const doc = await this.#readPropertiesDocument(instrumentId);
    if (!Object.prototype.hasOwnProperty.call(doc, key)) {
      return null;
    }
    return doc[key];
  }

  async setProperty(
    instrumentId: string,
    key: string,
    value: unknown
  ): Promise<void> {
    const path = this.propertiesPath(instrumentId);
    const doc = await this.#readPropertiesDocument(instrumentId);
    doc[key] = value;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(doc, null, 2));
  }

  async deleteProperty(
    instrumentId: string,
    key: string
  ): Promise<void> {
    const path = this.propertiesPath(instrumentId);
    const doc = await this.#readPropertiesDocument(instrumentId);
    if (!Object.prototype.hasOwnProperty.call(doc, key)) return;
    delete doc[key];
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(doc, null, 2));
  }

  async readFile(
    instrumentId: string,
    relativePath: string,
    encoding: "utf8" | "base64" = "utf8"
  ): Promise<string> {
    const absolute = this.#resolveSafeFilePath(instrumentId, relativePath);
    if (encoding === "base64") {
      const buf = await Bun.file(absolute).arrayBuffer();
      return Buffer.from(buf).toString("base64");
    }
    return readFile(absolute, "utf8");
  }

  async writeFile(
    instrumentId: string,
    relativePath: string,
    content: string,
    encoding: "utf8" | "base64" = "utf8"
  ): Promise<void> {
    const absolute = this.#resolveSafeFilePath(instrumentId, relativePath);
    await mkdir(dirname(absolute), { recursive: true });

    if (encoding === "base64") {
      await Bun.write(absolute, Buffer.from(content, "base64"));
      return;
    }

    await writeFile(absolute, content, "utf8");
  }

  async deleteFile(instrumentId: string, relativePath: string): Promise<void> {
    const absolute = this.#resolveSafeFilePath(instrumentId, relativePath);
    await rm(absolute, { force: true });
  }

  async listFiles(instrumentId: string, dir = ""): Promise<string[]> {
    const root = this.filesRoot(instrumentId);
    await mkdir(root, { recursive: true });

    const start = dir
      ? this.#resolveSafeFilePath(instrumentId, dir)
      : root;

    const out: string[] = [];
    await walk(start, async (path, isDir) => {
      if (isDir) return;
      out.push(relative(root, path).split("\\").join("/"));
    });

    out.sort((a, b) => a.localeCompare(b));
    return out;
  }

  async sqlQuery(
    instrumentId: string,
    sql: string,
    params: unknown[] = [],
    dbName = "main"
  ): Promise<Record<string, unknown>[]> {
    const db = await this.#openDb(instrumentId, dbName);
    try {
      const stmt = db.query(sql);
      const rows = stmt.all(...(params as any[])) as Record<string, unknown>[];
      return Array.isArray(rows) ? rows : [];
    } finally {
      db.close(false);
    }
  }

  async sqlExecute(
    instrumentId: string,
    sql: string,
    params: unknown[] = [],
    dbName = "main"
  ): Promise<SqlResult> {
    const db = await this.#openDb(instrumentId, dbName);
    try {
      const stmt = db.query(sql);
      const result = stmt.run(...(params as any[]));
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowid: Number.isFinite(Number(result.lastInsertRowid))
          ? Number(result.lastInsertRowid)
          : null,
      };
    } finally {
      db.close(false);
    }
  }

  async #openDb(instrumentId: string, dbName: string): Promise<Database> {
    const safeName = String(dbName || "main").trim().replace(/[^a-zA-Z0-9_-]/g, "") || "main";
    const root = this.dbRoot(instrumentId);
    await mkdir(root, { recursive: true });
    const dbPath = join(root, `${safeName}.db`);
    const db = new Database(dbPath, { create: true, strict: true });
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    return db;
  }

  async #readPropertiesDocument(instrumentId: string): Promise<Record<string, unknown>> {
    const path = this.propertiesPath(instrumentId);
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  #resolveSafeFilePath(instrumentId: string, relativePath: string): string {
    const root = this.filesRoot(instrumentId);
    const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const absolute = resolve(root, normalized);
    const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
    if (absolute !== root && !absolute.startsWith(rootWithSep)) {
      throw new Error("Invalid instrument file path");
    }
    return absolute;
  }

  #settingSecretAccount(instrumentId: string, key: string): string {
    const safeInstrument = String(instrumentId ?? "").trim();
    const safeKey = String(key ?? "").trim();
    return `instrument:${safeInstrument}:setting:${safeKey}`;
  }
}

async function walk(
  path: string,
  callback: (path: string, isDir: boolean) => Promise<void>
): Promise<void> {
  let current;
  try {
    current = await stat(path);
  } catch {
    return;
  }

  const isDir = current.isDirectory();
  await callback(path, isDir);
  if (!isDir) return;

  const entries = await readdir(path);
  for (const entry of entries) {
    await walk(join(path, entry), callback);
  }
}
