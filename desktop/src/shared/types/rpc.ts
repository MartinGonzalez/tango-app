import type { RPCSchema } from "electrobun/bun";
import type { SessionInfo, HistorySession } from "./sessions.ts";
import type { TranscriptMessage } from "./transcript.ts";
import type {
  DiffScope,
  DiffFile,
  BranchCommit,
  VcsInfo,
  CommitContext,
  CommitActionMode,
  CommitExecutionResult,
  StageFileContent,
} from "./diff.ts";
import type { SlashCommandEntry, ToolApprovalRequest } from "./tools.ts";
import type { InstalledPlugin } from "./plugins.ts";
import type {
  StageConnector,
  ConnectorProvider,
  ConnectorAuthSession,
  ConnectorCredential,
} from "./connectors.ts";
import type { InstrumentRegistryEntry, InstrumentSettingField, InstrumentCatalogEntry, InstrumentSourceConfig } from "./instruments.ts";
import type { Snapshot } from "./snapshot.ts";
import type { ClaudeStreamEvent } from "./stream.ts";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      getSessions: {
        params: {};
        response: SessionInfo[];
      };
      getTranscript: {
        params: { sessionId: string; transcriptPath?: string };
        response: TranscriptMessage[];
      };
      sendPrompt: {
        params: {
          prompt: string;
          cwd: string;
          fullAccess?: boolean;
          sessionId?: string;
          selectedFiles?: string[];
          model?: string;
          tools?: string[];
        };
        response: { sessionId: string };
      };
      sendFollowUp: {
        params: {
          sessionId: string;
          text: string;
          fullAccess?: boolean;
          selectedFiles?: string[];
        };
        response: void;
      };
      querySession: {
        params: {
          prompt: string;
          cwd: string;
          model?: string;
          tools?: string[];
        };
        response: {
          text: string;
          durationMs: number;
          costUsd: number;
        };
      };
      respondPermission: {
        params: { sessionId: string; toolUseId: string; allow: boolean };
        response: void;
      };
      respondToolApproval: {
        params: { toolUseId: string; allow: boolean };
        response: void;
      };
      renameSession: {
        params: { sessionId: string; newName: string };
        response: void;
      };
      killSession: {
        params: { sessionId: string };
        response: void;
      };
      deleteSession: {
        params: { sessionId: string; cwd?: string; transcriptPath?: string };
        response: { deleted: boolean; transcriptPath?: string | null };
      };
      getSessionHistory: {
        params: { cwd: string };
        response: HistorySession[];
      };
      getDiff: {
        params: { cwd: string; scope?: DiffScope; sessionId?: string };
        response: DiffFile[];
      };
      getCommitDiff: {
        params: { cwd: string; commitHash: string };
        response: DiffFile[];
      };
      getBranchHistory: {
        params: { cwd: string; limit?: number };
        response: BranchCommit[];
      };
      getVcsInfo: {
        params: { cwd: string };
        response: VcsInfo;
      };
      getCommitContext: {
        params: { cwd: string };
        response: CommitContext;
      };
      generateCommitMessage: {
        params: { cwd: string; includeUnstaged?: boolean };
        response: { message: string };
      };
      performCommit: {
        params: {
          cwd: string;
          message: string;
          includeUnstaged?: boolean;
          mode?: CommitActionMode;
        };
        response: CommitExecutionResult;
      };
      getStages: {
        params: {};
        response: string[];
      };
      getSessionNames: {
        params: {};
        response: Record<string, string>;
      };
      getStageFiles: {
        params: { cwd: string };
        response: string[];
      };
      getSlashCommands: {
        params: { cwd: string };
        response: SlashCommandEntry[];
      };
      getInstalledPlugins: {
        params: {};
        response: InstalledPlugin[];
      };
      getStageConnectors: {
        params: { stagePath: string };
        response: StageConnector[];
      };
      startConnectorAuth: {
        params: {
          stagePath: string;
          provider: ConnectorProvider;
        };
        response: ConnectorAuthSession;
      };
      getConnectorAuthStatus: {
        params: { authSessionId: string };
        response: ConnectorAuthSession;
      };
      disconnectStageConnector: {
        params: {
          stagePath: string;
          provider: ConnectorProvider;
        };
        response: void;
      };
      getConnectorCredential: {
        params: {
          stagePath: string;
          provider: ConnectorProvider;
        };
        response: ConnectorCredential;
      };
      getFileContent: {
        params: { cwd: string; path: string; maxBytes?: number };
        response: StageFileContent;
      };
      addStage: {
        params: { path: string };
        response: void;
      };
      removeStage: {
        params: { path: string };
        response: void;
      };
      openInFinder: {
        params: { path: string };
        response: void;
      };
      openWith: {
        params: { path: string; app?: string };
        response: void;
      };
      getAvailableApps: {
        params: {};
        response: Array<{ id: string; name: string; appName: string; icon?: string }>;
      };
      getPreferredOpenApp: {
        params: {};
        response: string | null;
      };
      setPreferredOpenApp: {
        params: { app: string | null };
        response: void;
      };
      openExternalUrl: {
        params: { url: string };
        response: void;
      };
      pickDirectory: {
        params: {};
        response: string | null;
      };
      listInstruments: {
        params: {};
        response: InstrumentRegistryEntry[];
      };
      browseInstrumentCatalog: {
        params: {};
        response: InstrumentCatalogEntry[];
      };
      getInstrumentSources: {
        params: {};
        response: InstrumentSourceConfig;
      };
      addInstrumentSource: {
        params: { source: string };
        response: InstrumentSourceConfig;
      };
      removeInstrumentSource: {
        params: { source: string };
        response: InstrumentSourceConfig;
      };
      getInstrumentFrontendSource: {
        params: { instrumentId: string };
        response: { code: string; sourcePath: string };
      };
      installInstrumentFromPath: {
        params: { path: string };
        response: InstrumentRegistryEntry;
      };
      setInstrumentEnabled: {
        params: { instrumentId: string; enabled: boolean };
        response: InstrumentRegistryEntry;
      };
      removeInstrument: {
        params: { instrumentId: string; deleteData?: boolean };
        response: { removed: boolean; dataDeleted: boolean };
      };
      getInstrumentSettingsSchema: {
        params: { instrumentId: string };
        response: InstrumentSettingField[];
      };
      getInstrumentSettingsValues: {
        params: { instrumentId: string };
        response: { values: Record<string, unknown> };
      };
      setInstrumentSettingValue: {
        params: {
          instrumentId: string;
          key: string;
          value: unknown;
        };
        response: { values: Record<string, unknown> };
      };
      instrumentStorageGetProperty: {
        params: { instrumentId: string; key: string };
        response: { value: unknown | null };
      };
      instrumentStorageSetProperty: {
        params: { instrumentId: string; key: string; value: unknown };
        response: void;
      };
      instrumentStorageDeleteProperty: {
        params: { instrumentId: string; key: string };
        response: void;
      };
      instrumentStorageReadFile: {
        params: { instrumentId: string; path: string; encoding?: "utf8" | "base64" };
        response: { content: string; encoding: "utf8" | "base64" };
      };
      instrumentStorageWriteFile: {
        params: {
          instrumentId: string;
          path: string;
          content: string;
          encoding?: "utf8" | "base64";
        };
        response: void;
      };
      instrumentStorageDeleteFile: {
        params: { instrumentId: string; path: string };
        response: void;
      };
      instrumentStorageListFiles: {
        params: { instrumentId: string; dir?: string };
        response: string[];
      };
      instrumentStorageSqlQuery: {
        params: {
          instrumentId: string;
          db?: string;
          sql: string;
          params?: unknown[];
        };
        response: { rows: Record<string, unknown>[] };
      };
      instrumentStorageSqlExecute: {
        params: {
          instrumentId: string;
          db?: string;
          sql: string;
          params?: unknown[];
        };
        response: { changes: number; lastInsertRowid: number | null };
      };
      instrumentCallAction: {
        params: {
          instrumentId: string;
          action: string;
          input?: unknown;
        };
        response: { result: unknown };
      };
      suspendInstrumentBackend: {
        params: { instrumentId: string };
        response: void;
      };
      resumeInstrumentBackend: {
        params: { instrumentId: string };
        response: void;
      };
      getAppVersion: {
        params: {};
        response: { version: string };
      };
      checkForUpdate: {
        params: {};
        response: {
          available: boolean;
          latestVersion: string;
          downloadUrl: string;
        };
      };
      performUpdate: {
        params: { downloadUrl: string };
        response: { success: boolean; error?: string };
      };
      toggleMaximize: {
        params: {};
        response: void;
      };
      logClient: {
        params: {
          ts?: string;
          level: "debug" | "info" | "warn" | "error";
          message: string;
          meta?: unknown;
        };
        response: void;
      };
      ptySpawn: {
        params: { id: string; cwd: string; cols?: number; rows?: number; sessionId?: string; newSessionId?: string };
        response: void;
      };
      ptyInput: {
        params: { id: string; data: string };
        response: void;
      };
      ptyResize: {
        params: { id: string; cols: number; rows: number };
        response: void;
      };
      ptyKill: {
        params: { id: string };
        response: void;
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      snapshotUpdate: Snapshot;
      sessionStream: {
        sessionId: string;
        event: ClaudeStreamEvent;
      };
      sessionIdResolved: {
        tempId: string;
        realId: string;
      };
      sessionEnded: {
        sessionId: string;
        exitCode: number;
      };
      toolApproval: ToolApprovalRequest;
      instrumentEvent: {
        instrumentId: string;
        event: string;
        payload?: unknown;
      };
      instrumentLog: {
        instrumentId: string;
        level: "error" | "warn" | "info" | "debug";
        message: string;
        detail?: unknown;
      };
      instrumentDevReload: {
        instrumentId: string;
        entries?: InstrumentRegistryEntry[];
      };
      stageFileChanged: {
        cwd: string;
        toolName: string;
      };
      sessionActivity: {
        sessionId: string;
        activity: import("./activity.ts").Activity;
      };
      ptyData: {
        id: string;
        data: string;
      };
      ptyExit: {
        id: string;
        exitCode: number;
      };
      sessionNameGenerated: {
        sessionId: string;
        name: string;
      };
    };
  }>;
};
