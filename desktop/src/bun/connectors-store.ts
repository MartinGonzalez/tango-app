import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";
import type {
  ConnectorProvider,
  ConnectorStatus,
  WorkspaceConnector,
} from "../shared/types.ts";

const DEFAULT_DB_PATH = join(homedir(), ".claude-sessions", "connectors.db");
const CURRENT_SCHEMA_VERSION = 1;

type WorkspaceConnectorRow = {
  workspace_path: string;
  provider: string;
  status: string;
  external_workspace_id: string | null;
  external_workspace_name: string | null;
  external_user_id: string | null;
  scopes: string | null;
  token_expires_at: string | null;
  last_error: string | null;
  keychain_account: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceConnectorRecord = WorkspaceConnector & {
  keychainAccount: string | null;
  createdAt: string;
};

type UpsertWorkspaceConnectorInput = {
  workspacePath: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  externalWorkspaceId?: string | null;
  externalWorkspaceName?: string | null;
  externalUserId?: string | null;
  scopes?: string[];
  tokenExpiresAt?: string | null;
  lastError?: string | null;
  keychainAccount?: string | null;
};

export class ConnectorsStore {
  #db: Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.#db = new Database(dbPath, { create: true, strict: true });
    this.#db.exec("PRAGMA foreign_keys = ON;");
    this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#migrate();
  }

  close(): void {
    this.#db.close(false);
  }

  listWorkspaceConnectors(workspacePath: string): WorkspaceConnector[] {
    return this.listWorkspaceConnectorRecords(workspacePath).map((record) => ({
      workspacePath: record.workspacePath,
      provider: record.provider,
      status: record.status,
      externalWorkspaceId: record.externalWorkspaceId,
      externalWorkspaceName: record.externalWorkspaceName,
      externalUserId: record.externalUserId,
      scopes: [...record.scopes],
      tokenExpiresAt: record.tokenExpiresAt,
      lastError: record.lastError,
      updatedAt: record.updatedAt,
    }));
  }

  listWorkspaceConnectorRecords(workspacePath: string): WorkspaceConnectorRecord[] {
    const rows = this.#db.query(
      `
      SELECT
        workspace_path,
        provider,
        status,
        external_workspace_id,
        external_workspace_name,
        external_user_id,
        scopes,
        token_expires_at,
        last_error,
        keychain_account,
        created_at,
        updated_at
      FROM workspace_connectors
      WHERE workspace_path = ?
      ORDER BY provider ASC
      `
    ).all(workspacePath) as WorkspaceConnectorRow[];

    return rows.map(mapWorkspaceConnectorRow);
  }

  getWorkspaceConnectorRecord(
    workspacePath: string,
    provider: ConnectorProvider
  ): WorkspaceConnectorRecord | null {
    const row = this.#db.query(
      `
      SELECT
        workspace_path,
        provider,
        status,
        external_workspace_id,
        external_workspace_name,
        external_user_id,
        scopes,
        token_expires_at,
        last_error,
        keychain_account,
        created_at,
        updated_at
      FROM workspace_connectors
      WHERE workspace_path = ?
        AND provider = ?
      LIMIT 1
      `
    ).get(workspacePath, provider) as WorkspaceConnectorRow | null;

    return row ? mapWorkspaceConnectorRow(row) : null;
  }

  upsertWorkspaceConnector(input: UpsertWorkspaceConnectorInput): WorkspaceConnectorRecord {
    const now = isoNow();
    const scopes = normalizeScopes(input.scopes).join(",");

    this.#db.query(
      `
      INSERT INTO workspace_connectors (
        workspace_path,
        provider,
        status,
        external_workspace_id,
        external_workspace_name,
        external_user_id,
        scopes,
        token_expires_at,
        last_error,
        keychain_account,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_path, provider) DO UPDATE SET
        status = excluded.status,
        external_workspace_id = excluded.external_workspace_id,
        external_workspace_name = excluded.external_workspace_name,
        external_user_id = excluded.external_user_id,
        scopes = excluded.scopes,
        token_expires_at = excluded.token_expires_at,
        last_error = excluded.last_error,
        keychain_account = excluded.keychain_account,
        updated_at = excluded.updated_at
      `
    ).run(
      input.workspacePath,
      input.provider,
      normalizeStatus(input.status),
      normalizeNullableString(input.externalWorkspaceId),
      normalizeNullableString(input.externalWorkspaceName),
      normalizeNullableString(input.externalUserId),
      scopes || null,
      normalizeNullableString(input.tokenExpiresAt),
      normalizeNullableString(input.lastError),
      normalizeNullableString(input.keychainAccount),
      now,
      now
    );

    const record = this.getWorkspaceConnectorRecord(
      input.workspacePath,
      input.provider
    );
    if (!record) {
      throw new Error("Failed to upsert workspace connector");
    }
    return record;
  }

  deleteWorkspaceConnector(workspacePath: string, provider: ConnectorProvider): void {
    this.#db.query(
      `
      DELETE FROM workspace_connectors
      WHERE workspace_path = ?
        AND provider = ?
      `
    ).run(workspacePath, provider);
  }

  #getUserVersion(): number {
    const row = this.#db.query("PRAGMA user_version").get() as {
      user_version: number;
    };
    return Number(row?.user_version ?? 0);
  }

  #setUserVersion(version: number): void {
    this.#db.exec(`PRAGMA user_version = ${Math.max(0, Math.floor(version))}`);
  }

  #migrate(): void {
    const current = this.#getUserVersion();
    if (current >= CURRENT_SCHEMA_VERSION) return;

    this.#db.exec("BEGIN");
    try {
      if (current < 1) {
        this.#db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_connectors (
            workspace_path TEXT NOT NULL,
            provider TEXT NOT NULL,
            status TEXT NOT NULL,
            external_workspace_id TEXT,
            external_workspace_name TEXT,
            external_user_id TEXT,
            scopes TEXT,
            token_expires_at TEXT,
            last_error TEXT,
            keychain_account TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(workspace_path, provider)
          );

          CREATE INDEX IF NOT EXISTS idx_workspace_connectors_workspace
            ON workspace_connectors(workspace_path, provider);
        `);
      }

      this.#setUserVersion(CURRENT_SCHEMA_VERSION);
      this.#db.exec("COMMIT");
    } catch (err) {
      this.#db.exec("ROLLBACK");
      throw err;
    }
  }
}

function mapWorkspaceConnectorRow(row: WorkspaceConnectorRow): WorkspaceConnectorRecord {
  return {
    workspacePath: row.workspace_path,
    provider: normalizeProvider(row.provider),
    status: normalizeStatus(row.status),
    externalWorkspaceId: row.external_workspace_id,
    externalWorkspaceName: row.external_workspace_name,
    externalUserId: row.external_user_id,
    scopes: parseScopes(row.scopes),
    tokenExpiresAt: row.token_expires_at,
    lastError: row.last_error,
    keychainAccount: row.keychain_account,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProvider(value: string): ConnectorProvider {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "slack") return "slack";
  if (normalized === "jira") return "jira";
  return "slack";
}

function normalizeStatus(value: string): ConnectorStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "connected") return "connected";
  if (normalized === "error") return "error";
  return "disconnected";
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) return [];
  const out = new Set<string>();
  for (const scope of scopes) {
    const normalized = String(scope ?? "").trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function parseScopes(value: string | null): string[] {
  if (!value) return [];
  return normalizeScopes(value.split(/[,\s]+/g));
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isoNow(): string {
  return new Date().toISOString();
}
