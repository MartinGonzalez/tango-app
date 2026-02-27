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
  TaskCardSummary,
  TaskCardDetail,
  TaskCardStatus,
  TaskSourceKind,
  TaskSource,
  TaskAction,
  TaskRun,
} from "./tasks.ts";
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
      getStageTasks: {
        params: { stagePath: string };
        response: TaskCardSummary[];
      };
      getTaskDetail: {
        params: { taskId: string };
        response: TaskCardDetail | null;
      };
      createTask: {
        params: { stagePath: string; title?: string; notes?: string };
        response: TaskCardDetail;
      };
      updateTask: {
        params: {
          taskId: string;
          patch: {
            title?: string;
            notes?: string;
            status?: TaskCardStatus;
            planMarkdown?: string | null;
          };
        };
        response: TaskCardDetail | null;
      };
      deleteTask: {
        params: { taskId: string };
        response: void;
      };
      addTaskSource: {
        params: {
          taskId: string;
          kind: TaskSourceKind;
          url?: string | null;
          content?: string | null;
        };
        response: TaskSource;
      };
      updateTaskSource: {
        params: {
          sourceId: string;
          patch: {
            title?: string | null;
            content?: string | null;
            url?: string | null;
          };
        };
        response: TaskSource | null;
      };
      removeTaskSource: {
        params: { sourceId: string };
        response: void;
      };
      fetchTaskSource: {
        params: { sourceId: string };
        response: TaskSource | null;
      };
      runTaskAction: {
        params: { taskId: string; action: TaskAction };
        response: { runId: string; sessionId: string | null };
      };
      getTaskRuns: {
        params: { taskId: string; limit?: number };
        response: TaskRun[];
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
      tasksChanged: {
        stagePath: string;
        taskId?: string;
      };
      pullRequestAgentReviewChanged: {
        repo: string;
        number: number;
        runId: string;
        status: PullRequestAgentReviewStatus;
      };
    };
  }>;
};
