import { h, qs, clearChildren } from "../lib/dom.ts";
import type {
  TranscriptMessage,
  ClaudeStreamEvent,
  ContentBlock,
  ToolApprovalRequest,
} from "../../shared/types.ts";

export type ChatCallbacks = {
  onSendPrompt: (prompt: string, fullAccess: boolean) => void;
  onStopSession?: () => void;
  onOpenInFinder?: (path: string) => void;
};

export class ChatView {
  #el: HTMLElement;
  #headerEl: HTMLElement;
  #headerTitleEl: HTMLElement;
  #headerWorkspaceEl: HTMLElement;
  #headerMenuEl: HTMLDetailsElement;
  #headerOpenInFinderBtn: HTMLButtonElement;
  #messagesEl: HTMLElement;
  #inputEl: HTMLTextAreaElement;
  #sendBtn: HTMLElement;
  #stopBtn: HTMLElement;
  #statusEl: HTMLElement;
  #permDetailsEl: HTMLDetailsElement;
  #permLabelEl: HTMLElement;
  #permDefaultBtn: HTMLButtonElement;
  #permFullBtn: HTMLButtonElement;
  #fullAccess: boolean = true;
  #callbacks: ChatCallbacks;
  #isWaiting: boolean = false;
  #workspacePath: string | null = null;
  #onGlobalPointerDown: (event: PointerEvent) => void;
  #onGlobalKeyDown: (event: KeyboardEvent) => void;

  constructor(container: HTMLElement, callbacks: ChatCallbacks) {
    this.#callbacks = callbacks;
    this.#onGlobalPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (this.#headerMenuEl.open) {
        if (!(target && this.#headerMenuEl.contains(target))) {
          this.#headerMenuEl.open = false;
        }
      }
      if (this.#permDetailsEl?.open) {
        if (!(target && this.#permDetailsEl.contains(target))) {
          this.#permDetailsEl.open = false;
        }
      }
    };
    this.#onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (this.#headerMenuEl.open) this.#headerMenuEl.open = false;
      if (this.#permDetailsEl?.open) this.#permDetailsEl.open = false;
    };

    this.#headerTitleEl = h("span", { class: "chat-header-title" }, ["New session"]);
    this.#headerWorkspaceEl = h("span", {
      class: "chat-header-workspace",
      hidden: true,
    });
    this.#headerOpenInFinderBtn = h(
      "button",
      {
        class: "chat-header-menu-item",
        onclick: (e: Event) => {
          e.preventDefault();
          const path = this.#workspacePath;
          if (!path) return;
          this.#callbacks.onOpenInFinder?.(path);
          this.#headerMenuEl.open = false;
        },
      },
      ["Open in Finder"]
    ) as HTMLButtonElement;

    this.#headerMenuEl = h("details", { class: "chat-header-menu" }, [
      h("summary", { class: "chat-header-menu-btn", title: "More" }, ["⋯"]),
      h("div", { class: "chat-header-menu-popover" }, [
        this.#headerOpenInFinderBtn,
      ]),
    ]) as HTMLDetailsElement;

    this.#headerEl = h("div", { class: "chat-header" }, [
      h("div", { class: "chat-header-meta" }, [
        this.#headerTitleEl,
        this.#headerWorkspaceEl,
      ]),
      this.#headerMenuEl,
    ]);

    this.#messagesEl = h("div", { class: "chat-messages" });

    this.#statusEl = h("div", { class: "chat-status", hidden: true });

    this.#inputEl = document.createElement("textarea");
    this.#inputEl.className = "chat-input";
    this.#inputEl.placeholder = "Ask Claude something...";
    this.#inputEl.rows = 1;
    this.#inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.#send();
      }
    });
    this.#inputEl.addEventListener("input", () => {
      this.#inputEl.style.height = "auto";
      this.#inputEl.style.height =
        Math.min(this.#inputEl.scrollHeight, 150) + "px";
    });

    this.#sendBtn = h(
      "button",
      { class: "chat-send-btn", onclick: () => this.#send() },
      ["Send"]
    );

    this.#stopBtn = h(
      "button",
      { class: "chat-stop-btn", onclick: () => this.#stop(), hidden: true },
      ["Stop"]
    );

    this.#permLabelEl = h("span", { class: "perm-chip-text" }, ["Full access"]);
    this.#permDefaultBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e: Event) => {
        e.preventDefault();
        this.#setPermission(false);
      },
    }, [
      h("span", { class: "perm-menu-title" }, ["Default permissions"]),
      h("span", { class: "perm-menu-check" }, ["\u2713"]),
    ]) as HTMLButtonElement;
    this.#permFullBtn = h("button", {
      class: "perm-menu-option",
      onclick: (e: Event) => {
        e.preventDefault();
        this.#setPermission(true);
      },
    }, [
      h("span", { class: "perm-menu-title" }, ["Full access"]),
      h("span", { class: "perm-menu-check" }, ["\u2713"]),
    ]) as HTMLButtonElement;

    this.#permDetailsEl = h("details", { class: "perm-selector" }, [
      h("summary", { class: "perm-chip" }, [
        h("span", { class: "perm-chip-icon" }, ["\u26E8"]),
        this.#permLabelEl,
        h("span", { class: "perm-chip-caret" }, ["\u25BE"]),
      ]),
      h("div", { class: "perm-menu" }, [
        this.#permDefaultBtn,
        this.#permFullBtn,
      ]),
    ]) as HTMLDetailsElement;

    const toggleRow = h("div", { class: "chat-perm-toggle-row" }, [this.#permDetailsEl]);
    this.#setPermission(true);

    const inputRow = h("div", { class: "chat-input-row" }, [
      this.#inputEl,
      this.#stopBtn,
      this.#sendBtn,
    ]);

    const composerEl = h("div", { class: "chat-composer" }, [
      this.#statusEl,
      inputRow,
      toggleRow,
    ]);

    this.#el = h("div", { class: "chat-view" }, [
      this.#headerEl,
      this.#messagesEl,
      composerEl,
    ]);

    container.appendChild(this.#el);
    this.setHeader("New session", null);
    document.addEventListener("pointerdown", this.#onGlobalPointerDown, true);
    document.addEventListener("keydown", this.#onGlobalKeyDown, true);
  }

  renderTranscript(messages: TranscriptMessage[]): void {
    clearChildren(this.#messagesEl);
    this.#isWaiting = false;
    this.#hideStatus();

    for (const msg of messages) {
      this.#appendTranscriptMessage(msg);
    }

    this.#scrollToBottom();
  }

  /**
   * Handle a real-time stream event from `claude -p --output-format stream-json --verbose`.
   * The actual format is:
   *   - system/init: session started
   *   - system/hook_*: hook lifecycle (ignored)
   *   - assistant: message with content[] array (text, tool_use, tool_result blocks)
   *   - result/success: session finished
   *   - error: something went wrong
   */
  appendStreamEvent(event: ClaudeStreamEvent): void {
    const ev = event as any;

    if (ev.type === "system") {
      if (ev.subtype === "init") {
        this.#showStatus("Claude is thinking...");
        this.#isWaiting = true;
      }
      // Ignore hook_started, hook_response, etc.
      return;
    }

    if (ev.type === "assistant") {
      this.#hideStatus();
      this.#isWaiting = true;
      const content = ev.message?.content;
      if (!content || !Array.isArray(content)) return;

      for (const block of content) {
        this.#renderContentBlock(block);
      }

      // After rendering tool_use blocks, check if this is a tool call
      // that might need permission. Show "waiting for approval" status.
      const hasToolUse = content.some((b: any) => b.type === "tool_use");
      if (hasToolUse) {
        this.#showStatus("Running tool...");
      } else {
        this.#showStatus("Claude is thinking...");
      }

      this.#scrollToBottom();
      return;
    }

    // Tool results from auto-execution come as "user" type messages
    if (ev.type === "user") {
      const content = ev.message?.content;
      if (!content || !Array.isArray(content)) return;

      for (const block of content) {
        if (block.type === "tool_result") {
          this.#hideStatus();
          const output = typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content ?? "");
          this.#appendToolResult(
            block.tool_use_id ?? "",
            output,
            block.is_error === true
          );
        }
      }

      // After tool result, Claude will think again
      this.#showStatus("Claude is thinking...");
      this.#scrollToBottom();
      return;
    }

    if (ev.type === "result") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const cost = ev.total_cost_usd;
      const turns = ev.num_turns;
      if (cost != null) {
        this.#appendSystemInfo(
          `Done — ${turns} turn${turns !== 1 ? "s" : ""}, $${cost.toFixed(4)}`
        );
      }
      return;
    }

    if (ev.type === "error") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const msg = ev.error?.message ?? "Unknown error";
      this.#appendError(msg);
      return;
    }

    // Catch-all: log unrecognized event types for debugging
    console.log("[chat-view] Unhandled event:", ev.type, ev);
  }

  appendUserMessage(text: string): void {
    const bubble = h("div", { class: "chat-bubble user" });
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
    this.#messagesEl.appendChild(bubble);
    this.#showStatus("Starting Claude...");
    this.#isWaiting = true;
    this.#scrollToBottom();
  }

  clear(): void {
    clearChildren(this.#messagesEl);
    this.#isWaiting = false;
    this.#hideStatus();
  }

  setHeader(sessionTitle: string, workspacePath: string | null): void {
    const title = sessionTitle.trim() || "New session";
    this.#headerTitleEl.textContent = title;

    this.#workspacePath = workspacePath;
    if (workspacePath) {
      const name = basename(workspacePath);
      this.#headerWorkspaceEl.textContent = name;
      this.#headerWorkspaceEl.title = workspacePath;
      this.#headerWorkspaceEl.hidden = false;
      this.#headerOpenInFinderBtn.disabled = false;
    } else {
      this.#headerWorkspaceEl.textContent = "";
      this.#headerWorkspaceEl.removeAttribute("title");
      this.#headerWorkspaceEl.hidden = true;
      this.#headerOpenInFinderBtn.disabled = true;
      this.#headerMenuEl.open = false;
    }
  }

  /**
   * Show a tool approval dialog pushed from the PreToolUse hook.
   * This blocks the hook until the user responds.
   */
  showToolApproval(
    req: ToolApprovalRequest,
    respond: (allow: boolean) => void
  ): void {
    const summary = summarizeToolInput(req.toolName, req.toolInput);

    const dialog = h("div", { class: "tool-approval-dialog" }, [
      h("div", { class: "tool-approval-header" }, [
        h("span", { class: "tool-icon" }, [toolIcon(req.toolName)]),
        h("span", { class: "tool-approval-name" }, [req.toolName]),
        summary
          ? h("span", { class: "tool-approval-summary" }, [summary])
          : null,
      ].filter(Boolean) as HTMLElement[]),
    ]);

    // Show tool input details
    const details = formatToolDetails(req.toolName, req.toolInput);
    if (details) {
      dialog.appendChild(
        h("pre", { class: "tool-approval-details" }, [details])
      );
    }

    const actions = h("div", { class: "tool-approval-actions" }, [
      h("button", {
        class: "tool-perm-btn tool-perm-allow",
        onclick: () => {
          respond(true);
          dialog.classList.add("responded", "approved");
          actions.innerHTML = '<span class="tool-approval-status">Allowed</span>';
          this.#showStatus(`Running ${req.toolName}...`);
        },
      }, ["Allow"]),
      h("button", {
        class: "tool-perm-btn tool-perm-deny",
        onclick: () => {
          respond(false);
          dialog.classList.add("responded", "denied");
          actions.innerHTML = '<span class="tool-approval-status denied">Denied</span>';
          this.#hideStatus();
        },
      }, ["Deny"]),
    ]);
    dialog.appendChild(actions);

    this.#messagesEl.appendChild(dialog);
    this.#showStatus(`Waiting for approval: ${req.toolName}`);
    this.#scrollToBottom();
  }

  focus(): void {
    this.#inputEl.focus();
  }

  #send(): void {
    if (this.#isWaiting) return;
    const text = this.#inputEl.value.trim();
    if (!text) return;
    this.#inputEl.value = "";
    this.#inputEl.style.height = "auto";
    const fullAccess = this.#fullAccess;
    this.appendUserMessage(text);
    this.#callbacks.onSendPrompt(text, fullAccess);
    this.#showStopButton();
  }

  #stop(): void {
    this.#callbacks.onStopSession?.();
    this.#hideStopButton();
    this.#hideStatus();
    this.#isWaiting = false;
  }

  #showStopButton(): void {
    this.#sendBtn.hidden = true;
    this.#stopBtn.hidden = false;
  }

  #hideStopButton(): void {
    this.#stopBtn.hidden = true;
    this.#sendBtn.hidden = false;
  }

  // ── Render content blocks from assistant message ────────────────

  #renderContentBlock(block: ContentBlock): void {
    if (block.type === "text") {
      const bubble = h("div", { class: "chat-bubble assistant" });
      bubble.innerHTML = renderMarkdown(block.text);
      this.#messagesEl.appendChild(bubble);
    } else if (block.type === "tool_use") {
      // AskUserQuestion — render as an interactive prompt
      if (block.name === "AskUserQuestion") {
        this.#renderAskUserQuestion(block);
        return;
      }

      const summary = summarizeToolInput(block.name, block.input);
      const details = formatToolDetails(block.name, block.input);
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          block.name,
          summary ? ` ${summary}` : "",
        ]),
        details ? h("div", { class: "tool-input" }) : null,
      ].filter(Boolean) as HTMLElement[]) as HTMLDetailsElement;
      detailsPanel.open = shouldExpandTool(block.name);

      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel,
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent) as HTMLElement | null;
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      this.#showStatus(`Running ${block.name}...`);
    } else if (block.type === "tool_result") {
      this.#hideStatus();
      return;
    }
  }

  /**
   * Render the AskUserQuestion tool as an interactive dialog.
   */
  #renderAskUserQuestion(block: ContentBlock & { type: "tool_use" }): void {
    const input = block.input as any;
    const questions = input?.questions ?? [];

    const dialog = h("div", { class: "chat-permission-dialog" });

    for (const q of questions) {
      const questionEl = h("div", { class: "perm-question" });

      // Question text
      if (q.header) {
        questionEl.appendChild(
          h("div", { class: "perm-header" }, [q.header])
        );
      }
      questionEl.appendChild(
        h("div", { class: "perm-text" }, [q.question ?? ""])
      );

      // Options as buttons
      if (q.options && Array.isArray(q.options)) {
        const optionsEl = h("div", { class: "perm-options" });
        for (const opt of q.options) {
          const btn = h(
            "button",
            {
              class: "perm-option-btn",
              onclick: () => {
                // Respond by sending a follow-up with the selection
                this.#callbacks.onSendPrompt(opt.label, this.#fullAccess);
                // Disable all buttons in this dialog
                dialog
                  .querySelectorAll("button")
                  .forEach((b) => ((b as HTMLButtonElement).disabled = true));
                dialog.classList.add("responded");
              },
            },
            [opt.label]
          );
          if (opt.description) {
            btn.title = opt.description;
          }
          optionsEl.appendChild(btn);
        }
        questionEl.appendChild(optionsEl);
      }

      dialog.appendChild(questionEl);
    }

    this.#messagesEl.appendChild(dialog);
    this.#hideStatus();
    this.#isWaiting = false; // Allow user to type a custom response
  }

  /**
   * Append a tool result from a "user" type stream event.
   */
  #appendToolResult(
    _toolUseId: string,
    _output: string,
    _isError: boolean
  ): void {
    return;
  }

  // ── Render transcript messages (historical) ─────────────────────

  #appendTranscriptMessage(msg: TranscriptMessage): void {
    const isUser = msg.role === "user";
    if (msg.toolName && !isUser) {
      const summary = summarizeToolInput(msg.toolName, msg.toolInput);
      const details = formatToolDetails(msg.toolName, msg.toolInput ?? {});
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          msg.toolName,
          summary ? ` ${summary}` : "",
        ]),
        details ? h("div", { class: "tool-input" }) : null,
      ].filter(Boolean) as HTMLElement[]) as HTMLDetailsElement;
      detailsPanel.open = shouldExpandTool(msg.toolName);

      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel,
      ]);
      if (details) {
        const detailsEl = qs(".tool-input", toolEvent) as HTMLElement | null;
        if (detailsEl) {
          detailsEl.innerHTML = renderToolContent(details);
        }
      }
      this.#messagesEl.appendChild(toolEvent);
      return;
    }

    const bubble = h("div", {
      class: `chat-bubble ${isUser ? "user" : "assistant"}`,
    });
    bubble.innerHTML = renderMarkdown(msg.content);
    this.#messagesEl.appendChild(bubble);
  }

  // ── System/error messages ───────────────────────────────────────

  #appendSystemInfo(text: string): void {
    const el = h("div", { class: "chat-system-info" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }

  #appendError(text: string): void {
    const el = h("div", { class: "chat-error" }, [text]);
    this.#messagesEl.appendChild(el);
    this.#scrollToBottom();
  }


  // ── UI helpers ──────────────────────────────────────────────────

  #showStatus(text: string): void {
    this.#statusEl.textContent = text;
    this.#statusEl.hidden = false;
  }

  #hideStatus(): void {
    this.#statusEl.hidden = true;
  }

  #scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
    });
  }

  #setPermission(fullAccess: boolean): void {
    this.#fullAccess = fullAccess;
    this.#permLabelEl.textContent = fullAccess ? "Full access" : "Default permissions";
    this.#permDetailsEl.classList.toggle("full-access", fullAccess);
    this.#permDefaultBtn.classList.toggle("selected", !fullAccess);
    this.#permFullBtn.classList.toggle("selected", fullAccess);
    this.#permDetailsEl.open = false;
  }

  get element(): HTMLElement {
    return this.#el;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function toolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    Bash: "\u25B8",
    Edit: "\u270E",
    Write: "\u270E",
    Read: "\u25A1",
    Glob: "\u2315",
    Grep: "\u2315",
    Task: "\u2B9E",
    WebFetch: "\u2197",
  };
  return icons[toolName] ?? "\u2022";
}

function summarizeToolInput(
  toolName: string,
  input?: Record<string, unknown>
): string {
  if (!input) return "";
  switch (toolName) {
    case "Bash":
      return String(input.command ?? "").slice(0, 80);
    case "Edit":
    case "Write":
    case "Read":
      return basename(String(input.file_path ?? ""));
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return String(input.pattern ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    case "Task":
      return String(input.description ?? input.prompt ?? "").slice(0, 60);
    default:
      return "";
  }
}

function basename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatToolDetails(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  switch (toolName) {
    case "Bash":
      return `\`\`\`bash\n${String(input.command ?? "")}\n\`\`\``;
    case "Write": {
      const filePath = String(input.file_path ?? "");
      const content = String(input.content ?? "").slice(0, 4000);
      const added = content
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => `+${line}`)
        .join("\n");
      return `File: ${filePath}\n\n\`\`\`diff\n${added || "+(empty file)"}\n\`\`\``;
    }
    case "Edit": {
      const filePath = String(input.file_path ?? "");
      const oldText = String(input.old_string ?? "").slice(0, 2000);
      const newText = String(input.new_string ?? "").slice(0, 2000);
      const diff = toUnifiedDiff(oldText, newText);
      return `File: ${filePath}\n\n\`\`\`diff\n${diff}\n\`\`\``;
    }
    case "Read":
      return String(input.file_path ?? "");
    default:
      return null;
  }
}

function renderMarkdown(text: string): string {
  const normalized = escapeHtml(text).replace(/\r\n?/g, "\n");
  const codeBlocks: string[] = [];

  const withCodePlaceholders = normalized.replace(
    /```([^\n`]*)\n?([\s\S]*?)```/g,
    (_match, lang, code) => {
      const codeText = String(code).replace(/\n$/, "");
      const language = String(lang ?? "").trim().toLowerCase();
      const index = codeBlocks.push(
        language === "diff"
          ? renderInlineDiff(codeText)
          : `<pre class="code-block"><code>${codeText}</code></pre>`
      ) - 1;
      return `@@CODE_BLOCK_${index}@@`;
    }
  );

  const renderedText = withCodePlaceholders
    .replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

  return renderedText.replace(/@@CODE_BLOCK_(\d+)@@/g, (_match, idx) => {
    const block = codeBlocks[Number(idx)];
    return block ?? "";
  });
}

function renderToolContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // If already markdown code block, render as-is.
  if (trimmed.includes("```")) {
    return renderMarkdown(trimmed);
  }

  // Tool payloads are usually path + raw code/content. If multiline, force code block.
  if (trimmed.includes("\n")) {
    return `<pre class="code-block"><code>${escapeHtml(trimmed)}</code></pre>`;
  }

  return renderMarkdown(trimmed);
}

function guessCodeLanguage(filePath: string): string {
  const ext = basename(filePath).split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    php: "php",
    sh: "bash",
    zsh: "bash",
    bash: "bash",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    html: "html",
    css: "css",
    sql: "sql",
  };
  return map[ext] ?? "";
}

function toUnifiedDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = 0;
  let j = 0;
  const out: string[] = [];

  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${oldLines[i]}`);
      i++;
    } else {
      out.push(`+${newLines[j]}`);
      j++;
    }
  }

  while (i < n) out.push(`-${oldLines[i++]}`);
  while (j < m) out.push(`+${newLines[j++]}`);

  return out.length > 0 ? out.join("\n") : "(no textual changes)";
}

function renderInlineDiff(diffText: string): string {
  const rows: string[] = [];
  const lines = diffText.split("\n");
  let oldLine = 1;
  let newLine = 1;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push(
        `<tr class="diff-hunk-header"><td class="line-no"></td><td class="line-content hunk-label">${escapeHtml(line)}</td></tr>`
      );
      continue;
    }

    let rowClass = "diff-context";
    if (line.startsWith("+")) {
      rowClass = "diff-add";
    } else if (line.startsWith("-")) {
      rowClass = "diff-delete";
    }

    let lineNo = "";
    if (line.startsWith("+")) {
      lineNo = String(newLine++);
    } else if (line.startsWith("-")) {
      lineNo = String(oldLine++);
    } else {
      lineNo = String(newLine);
      oldLine++;
      newLine++;
    }

    rows.push(
      `<tr class="diff-line ${rowClass}"><td class="line-no">${lineNo}</td><td class="line-content">${escapeHtml(line)}</td></tr>`
    );
  }

  return `<div class="chat-inline-diff"><table class="diff-table unified"><tbody>${rows.join("")}</tbody></table></div>`;
}

function shouldExpandTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "write"
    || normalized === "edit"
    || normalized === "multiedit"
    || normalized === "remove"
    || normalized === "delete";
}
