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
} from "./connectors.ts";
import type {
  PullRequestSummary,
  PullRequestDetail,
  PullRequestReviewState,
  PullRequestAgentReviewRun,
  PullRequestAgentReviewDocument,
  PullRequestAgentReviewStatus,
} from "./pull-requests.ts";
import type { InstrumentRegistryEntry } from "./instruments.ts";
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
      getAssignedPullRequests: {
        params: { limit?: number };
        response: PullRequestSummary[];
      };
      getOpenedPullRequests: {
        params: { limit?: number };
        response: PullRequestSummary[];
      };
      getReviewRequestedPullRequests: {
        params: { limit?: number };
        response: PullRequestSummary[];
      };
      getPullRequestDetail: {
        params: { repo: string; number: number };
        response: PullRequestDetail;
      };
      getPullRequestDiff: {
        params: { repo: string; number: number; commitSha?: string | null };
        response: DiffFile[];
      };
      getPullRequestReviewState: {
        params: { repo: string; number: number };
        response: PullRequestReviewState | null;
      };
      setPullRequestFileSeen: {
        params: {
          repo: string;
          number: number;
          headSha: string;
          filePath: string;
          fileSha: string | null;
          seen: boolean;
        };
        response: PullRequestReviewState;
      };
      markPullRequestFilesSeen: {
        params: {
          repo: string;
          number: number;
          headSha: string;
          files: Array<{ path: string; sha: string | null }>;
        };
        response: PullRequestReviewState;
      };
      replyPullRequestReviewComment: {
        params: {
          repo: string;
          number: number;
          commentId: string;
          body: string;
        };
        response: void;
      };
      createPullRequestReviewComment: {
        params: {
          repo: string;
          number: number;
          commitSha: string;
          path: string;
          line: number;
          side: "LEFT" | "RIGHT";
          body: string;
        };
        response: void;
      };
      getPullRequestAgentReviews: {
        params: { repo: string; number: number };
        response: PullRequestAgentReviewRun[];
      };
      getPullRequestAgentReviewDocument: {
        params: { repo: string; number: number; version: number };
        response: PullRequestAgentReviewDocument | null;
      };
      startPullRequestAgentReview: {
        params: { repo: string; number: number; headSha: string };
        response: PullRequestAgentReviewRun;
      };
      applyPullRequestAgentReviewIssue: {
        params: {
          repo: string;
          number: number;
          reviewVersion: number;
          suggestionIndex: number;
        };
        response: { sessionId: string };
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
      instrumentInvoke: {
        params: {
          instrumentId: string;
          method: string;
          params?: Record<string, unknown>;
        };
        response: { result: unknown };
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
      pullRequestAgentReviewChanged: {
        repo: string;
        number: number;
        runId: string;
        status: PullRequestAgentReviewStatus;
      };
      instrumentEvent: {
        instrumentId: string;
        event: string;
        payload?: unknown;
      };
    };
  }>;
};
