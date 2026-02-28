export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export type StreamTodoEntry = {
  content: string;
  status: string;
  activeForm?: string;
  [key: string]: unknown;
};

export type StreamToolUseResult = {
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
  success?: boolean;
  commandName?: string;
  command_name?: string;
  oldTodos?: StreamTodoEntry[];
  newTodos?: StreamTodoEntry[];
  [key: string]: unknown;
};

export type ClaudeStreamEvent =
  | {
      type: "system";
      subtype: "init";
      session_id: string;
      model?: string;
      cwd?: string;
      tools?: string[];
      [key: string]: unknown;
    }
  | {
      type: "system";
      subtype: string;
      session_id: string;
      [key: string]: unknown;
    }
  | {
      type: "assistant";
      message: {
        id: string;
        role: "assistant";
        content: ContentBlock[];
        model: string;
        stop_reason: string | null;
        usage?: Record<string, unknown>;
      };
      session_id: string;
      parent_tool_use_id: string | null;
      [key: string]: unknown;
    }
  | {
      type: "result";
      subtype: "success";
      is_error: boolean;
      result: string;
      session_id: string;
      duration_ms: number;
      total_cost_usd: number;
      num_turns: number;
      [key: string]: unknown;
    }
  | {
      type: "user";
      message: {
        role: "user";
        content: ContentBlock[];
      };
      session_id: string;
      tool_use_result?: StreamToolUseResult;
      [key: string]: unknown;
    }
  | {
      type: "error";
      error: { message: string; code?: string };
      session_id?: string;
    };
