import { h, qs, clearChildren } from "../lib/dom.ts";
import type {
  TranscriptMessage,
  ClaudeStreamEvent,
  ContentBlock,
  ToolApprovalRequest,
  Activity,
} from "../../shared/types.ts";

export type ChatCallbacks = {
  onSendPrompt: (
    prompt: string,
    fullAccess: boolean,
    selectedFiles?: string[]
  ) => void;
  onStopSession?: () => void;
  onOpenInFinder?: (path: string) => void;
  onSearchFiles?: (query: string) => Promise<string[]>;
};

export class ChatView {
  #el: HTMLElement;
  #headerEl: HTMLElement;
  #headerTitleEl: HTMLElement;
  #headerWorkspaceEl: HTMLElement;
  #headerMenuEl: HTMLDetailsElement;
  #headerOpenInFinderBtn: HTMLButtonElement;
  #messagesEl: HTMLElement;
  #composerEl: HTMLElement;
  #scrollToBottomBtn: HTMLButtonElement;
  #inputEl: HTMLTextAreaElement;
  #inputWrapEl: HTMLElement;
  #attachmentStripEl: HTMLElement;
  #attachmentListEl: HTMLElement;
  #sendBtn: HTMLElement;
  #stopBtn: HTMLElement;
  #mentionMenuEl: HTMLElement;
  #mentionListEl: HTMLElement;
  #mentionEmptyEl: HTMLElement;
  #contextDetailsEl: HTMLDetailsElement;
  #contextSummaryValueEl: HTMLElement;
  #contextUsedEl: HTMLElement;
  #contextTokensEl: HTMLElement;
  #contextHintEl: HTMLElement;
  #statusEl: HTMLElement;
  #permDetailsEl: HTMLDetailsElement;
  #permLabelEl: HTMLElement;
  #permDefaultBtn: HTMLButtonElement;
  #permFullBtn: HTMLButtonElement;
  #fullAccess: boolean = true;
  #callbacks: ChatCallbacks;
  #isWaiting: boolean = false;
  #workspacePath: string | null = null;
  #mentionVisible: boolean = false;
  #mentionSelection: number = 0;
  #mentionRequestId: number = 0;
  #mentionSuggestions: string[] = [];
  #selectedFiles: string[] = [];
  #hasUserScrolledUp: boolean = false;
  #isProgrammaticScroll: boolean = false;
  #onGlobalPointerDown: (event: PointerEvent) => void;
  #onGlobalKeyDown: (event: KeyboardEvent) => void;
  #scrollAnimationFrame: number | null = null;
  #composerResizeObserver: ResizeObserver | null = null;

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
      if (this.#contextDetailsEl?.open) {
        if (!(target && this.#contextDetailsEl.contains(target))) {
          this.#contextDetailsEl.open = false;
        }
      }
      if (
        this.#mentionVisible
        && !(target && this.#inputWrapEl.contains(target))
      ) {
        this.#hideMentionMenu();
      }
    };
    this.#onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (this.#headerMenuEl.open) this.#headerMenuEl.open = false;
      if (this.#permDetailsEl?.open) this.#permDetailsEl.open = false;
      if (this.#contextDetailsEl?.open) this.#contextDetailsEl.open = false;
      if (this.#mentionVisible) this.#hideMentionMenu();
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
    this.#messagesEl.addEventListener("scroll", (event) => {
      this.#onMessagesScroll(event);
    });

    this.#scrollToBottomBtn = h("button", {
      type: "button",
      class: "chat-scroll-bottom-btn",
      hidden: true,
      title: "Scroll to latest message",
      "aria-label": "Scroll to latest message",
      onclick: () => this.#scrollToBottomAnimated(1000),
    }, ["\u2193"]) as HTMLButtonElement;

    this.#statusEl = h("div", { class: "chat-status", hidden: true });

    this.#inputEl = document.createElement("textarea");
    this.#inputEl.className = "chat-input";
    this.#inputEl.placeholder = "Ask Claude something...";
    this.#inputEl.rows = 1;
    this.#inputEl.addEventListener("keydown", (e) => this.#onInputKeyDown(e));
    this.#inputEl.addEventListener("input", () => {
      this.#resizeInput();
      void this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("click", () => {
      void this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("keyup", (event) => {
      if (
        event.key.startsWith("Arrow")
        || event.key === "Home"
        || event.key === "End"
      ) {
        void this.#updateMentionSuggestions();
      }
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

    this.#mentionListEl = h("div", { class: "chat-mention-list" });
    this.#mentionEmptyEl = h("div", {
      class: "chat-mention-empty",
      hidden: true,
    }, ["No matching files"]);
    this.#mentionMenuEl = h("div", {
      class: "chat-mention-menu",
      hidden: true,
    }, [
      this.#mentionListEl,
      this.#mentionEmptyEl,
    ]);
    this.#attachmentListEl = h("div", { class: "chat-attachment-list" });
    this.#attachmentStripEl = h("div", {
      class: "chat-attachment-strip",
      hidden: true,
    }, [this.#attachmentListEl]);
    this.#inputWrapEl = h("div", { class: "chat-input-wrap" }, [
      this.#attachmentStripEl,
      this.#inputEl,
      this.#mentionMenuEl,
    ]);

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

    this.#contextSummaryValueEl = h("span", { class: "context-meter-value" }, ["--"]);
    this.#contextUsedEl = h("div", { class: "context-meter-line" }, ["--"]);
    this.#contextTokensEl = h("div", { class: "context-meter-line" }, [""]);
    this.#contextHintEl = h("div", { class: "context-meter-hint" }, [
      "Claude may automatically compact its context.",
    ]);
    this.#contextDetailsEl = h("details", {
      class: "context-meter",
      hidden: true,
    }, [
      h("summary", { class: "context-meter-btn", title: "Context window usage" }, [
        h("span", { class: "context-meter-spinner" }),
        this.#contextSummaryValueEl,
      ]),
      h("div", { class: "context-meter-popover" }, [
        h("div", { class: "context-meter-title" }, ["Context window"]),
        this.#contextUsedEl,
        this.#contextTokensEl,
        this.#contextHintEl,
      ]),
    ]) as HTMLDetailsElement;

    const toggleRow = h("div", { class: "chat-perm-toggle-row" }, [
      this.#permDetailsEl,
      h("div", { class: "chat-footer-spacer" }),
      this.#contextDetailsEl,
    ]);
    this.#setPermission(true);

    const inputRow = h("div", { class: "chat-input-row" }, [
      this.#inputWrapEl,
      this.#stopBtn,
      this.#sendBtn,
    ]);

    const composerEl = h("div", { class: "chat-composer" }, [
      this.#scrollToBottomBtn,
      this.#statusEl,
      inputRow,
      toggleRow,
    ]);
    this.#composerEl = composerEl;

    this.#el = h("div", { class: "chat-view" }, [
      this.#headerEl,
      this.#messagesEl,
      composerEl,
    ]);

    container.appendChild(this.#el);
    this.#syncComposerInset();
    if (typeof ResizeObserver !== "undefined") {
      this.#composerResizeObserver = new ResizeObserver(() => {
        this.#syncComposerInset();
      });
      this.#composerResizeObserver.observe(this.#composerEl);
    }
    this.setHeader("New session", null);
    this.#updateScrollToBottomButton();
    document.addEventListener("pointerdown", this.#onGlobalPointerDown, true);
    document.addEventListener("keydown", this.#onGlobalKeyDown, true);
  }

  renderTranscript(messages: TranscriptMessage[]): void {
    clearChildren(this.#messagesEl);
    this.#hasUserScrolledUp = false;
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
        // Plain assistant text means this turn is ready for user follow-up.
        this.#hideStatus();
        this.#isWaiting = false;
        this.#hideStopButton();
      }

      this.#scrollToBottom();
      return;
    }

    // Tool results from auto-execution come as "user" type messages
    if (ev.type === "user") {
      const content = ev.message?.content;
      if (!content || !Array.isArray(content)) return;

      let hasToolResult = false;
      for (const block of content) {
        if (block.type === "tool_result") {
          hasToolResult = true;
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

      // After tool result, Claude will think again.
      // Ignore regular user content echoed in the stream.
      if (hasToolResult) {
        this.#showStatus("Claude is thinking...");
      }
      this.#scrollToBottom();
      return;
    }

    if (ev.type === "result") {
      this.#hideStatus();
      this.#isWaiting = false;
      this.#hideStopButton();
      const turns = ev.num_turns;
      if (typeof turns === "number") {
        this.#appendSystemInfo(`Done — ${turns} turn${turns !== 1 ? "s" : ""}`);
      } else {
        this.#appendSystemInfo("Done");
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

  appendUserMessage(text: string, selectedFiles: string[] = []): void {
    const bubble = h("div", { class: "chat-bubble user" });
    bubble.innerHTML = this.#renderUserMessageHtml(text, selectedFiles);
    this.#messagesEl.appendChild(bubble);
    this.#showStatus("Starting Claude...");
    this.#isWaiting = true;
    this.#scrollToBottom();
  }

  clear(): void {
    clearChildren(this.#messagesEl);
    this.#cancelScrollAnimation();
    this.#hasUserScrolledUp = false;
    this.#updateScrollToBottomButton();
    this.#isWaiting = false;
    this.#hideStatus();
    this.#hideMentionMenu();
    this.#clearSelectedFiles();
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

  setContextUsage(
    contextPercentage: number | null,
    model: string | null,
    activity: Activity | null,
    promptTokens: number | null = null
  ): void {
    const normalized = normalizePercent(contextPercentage);
    const hasAnySignal = normalized !== null || promptTokens !== null || model !== null || activity !== null;
    if (!hasAnySignal) {
      this.#contextDetailsEl.hidden = true;
      this.#contextDetailsEl.open = false;
      return;
    }

    this.#contextDetailsEl.hidden = false;
    const isBusy = activity === "working" || activity === "waiting";
    this.#contextDetailsEl.classList.toggle("busy", isBusy);

    const windowSize = inferContextWindow(model);
    let usedPct: number | null = normalized;
    if (usedPct === null && windowSize && promptTokens !== null) {
      usedPct = Math.min(100, (promptTokens / windowSize) * 100);
    }

    if (usedPct === null) {
      this.#contextSummaryValueEl.textContent = "--";
      this.#contextUsedEl.textContent = "Usage is being tracked";
      this.#contextTokensEl.textContent = model
        ? `Model: ${model}`
        : "No context usage data yet";
      return;
    }

    const roundedPct = Math.round(usedPct);
    const leftPct = Math.max(0, 100 - roundedPct);
    this.#contextSummaryValueEl.textContent = `${roundedPct}%`;
    this.#contextUsedEl.textContent = `${roundedPct}% used (${leftPct}% left)`;

    if (windowSize) {
      const usedTokens = promptTokens !== null
        ? Math.round(promptTokens)
        : Math.round((windowSize * roundedPct) / 100);
      this.#contextTokensEl.textContent =
        `Approx. ${formatTokens(usedTokens)} / ${formatTokens(windowSize)} tokens used`;
    } else if (model) {
      this.#contextTokensEl.textContent = `Model: ${model}`;
    } else {
      this.#contextTokensEl.textContent = "Live estimate from Claude hooks";
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

  #onInputKeyDown(event: KeyboardEvent): void {
    if (
      event.key === "Backspace"
      && this.#inputEl.value.length === 0
      && this.#selectedFiles.length > 0
    ) {
      event.preventDefault();
      this.#selectedFiles.pop();
      this.#renderSelectedFiles();
      return;
    }

    if (this.#mentionVisible) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.#moveMentionSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.#moveMentionSelection(-1);
        return;
      }
      if (
        ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab")
        && this.#mentionSuggestions.length > 0
      ) {
        event.preventDefault();
        this.#applyMentionSelection();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.#hideMentionMenu();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.#send();
    }
  }

  #send(): void {
    if (this.#isWaiting) return;
    const text = this.#inputEl.value.trim();
    const selectedFiles = this.#selectedFiles.slice();
    if (!text && selectedFiles.length === 0) return;
    this.#hideMentionMenu();
    this.#inputEl.value = "";
    this.#resizeInput();
    const fullAccess = this.#fullAccess;
    this.appendUserMessage(text, selectedFiles);
    this.#callbacks.onSendPrompt(text, fullAccess, selectedFiles);
    this.#clearSelectedFiles();
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

  #resizeInput(): void {
    this.#inputEl.style.height = "auto";
    this.#inputEl.style.height =
      Math.min(this.#inputEl.scrollHeight, 150) + "px";
  }

  async #updateMentionSuggestions(): Promise<void> {
    const provider = this.#callbacks.onSearchFiles;
    if (!provider) {
      this.#hideMentionMenu();
      return;
    }

    const cursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const token = findMentionToken(this.#inputEl.value, cursor);
    if (!token) {
      this.#hideMentionMenu();
      return;
    }

    const requestId = ++this.#mentionRequestId;
    let suggestions: string[] = [];
    try {
      suggestions = await provider(token.query);
    } catch (error) {
      console.error("Failed to load @file suggestions:", error);
      this.#hideMentionMenu();
      return;
    }

    if (requestId !== this.#mentionRequestId) return;

    const latestCursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const latestToken = findMentionToken(this.#inputEl.value, latestCursor);
    if (!latestToken) {
      this.#hideMentionMenu();
      return;
    }

    this.#mentionSuggestions = suggestions.slice(0, 30);
    if (this.#mentionSuggestions.length === 0) {
      clearChildren(this.#mentionListEl);
      this.#mentionEmptyEl.hidden = false;
      this.#mentionMenuEl.hidden = false;
      this.#mentionVisible = true;
      return;
    }

    this.#mentionSelection = Math.min(
      this.#mentionSelection,
      this.#mentionSuggestions.length - 1
    );
    this.#mentionEmptyEl.hidden = true;
    this.#mentionMenuEl.hidden = false;
    this.#mentionVisible = true;
    this.#renderMentionSuggestions();
  }

  #moveMentionSelection(delta: number): void {
    if (!this.#mentionVisible || this.#mentionSuggestions.length === 0) return;
    const max = this.#mentionSuggestions.length - 1;
    this.#mentionSelection = clamp(this.#mentionSelection + delta, 0, max);
    this.#renderMentionSuggestions();
  }

  #renderMentionSuggestions(): void {
    clearChildren(this.#mentionListEl);

    this.#mentionSuggestions.forEach((path, index) => {
      const { name, dir } = splitPath(path);
      const option = h("button", {
        type: "button",
        class: `chat-mention-option${index === this.#mentionSelection ? " active" : ""}`,
      }, [
        h("span", { class: "chat-mention-icon" }, [fileIcon(name)]),
        h("span", { class: "chat-mention-name" }, [name]),
        h("span", { class: "chat-mention-dir" }, [dir || "./"]),
      ]) as HTMLButtonElement;

      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", (event) => {
        event.preventDefault();
        this.#mentionSelection = index;
        this.#applyMentionSelection();
      });

      this.#mentionListEl.appendChild(option);
    });

    const active = this.#mentionListEl.querySelector<HTMLElement>(".chat-mention-option.active");
    active?.scrollIntoView({ block: "nearest" });
  }

  #applyMentionSelection(): void {
    if (this.#mentionSuggestions.length === 0) {
      this.#hideMentionMenu();
      return;
    }

    const selected = this.#mentionSuggestions[this.#mentionSelection];
    if (!selected) {
      this.#hideMentionMenu();
      return;
    }

    const value = this.#inputEl.value;
    const cursor = this.#inputEl.selectionStart ?? value.length;
    const token = findMentionToken(value, cursor);
    if (!token) {
      this.#hideMentionMenu();
      return;
    }

    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    const needsSingleSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    const inserted = `${before}${needsSingleSpace ? " " : ""}${after}`;

    this.#inputEl.value = inserted;
    const nextCursor = before.length + (needsSingleSpace ? 1 : 0);
    this.#inputEl.setSelectionRange(nextCursor, nextCursor);
    this.#addSelectedFile(selected);
    this.#resizeInput();
    this.#hideMentionMenu();
    this.#inputEl.focus();
  }

  #hideMentionMenu(): void {
    this.#mentionVisible = false;
    this.#mentionSuggestions = [];
    this.#mentionSelection = 0;
    this.#mentionMenuEl.hidden = true;
    this.#mentionEmptyEl.hidden = true;
    clearChildren(this.#mentionListEl);
  }

  #addSelectedFile(path: string): void {
    if (this.#selectedFiles.includes(path)) return;
    this.#selectedFiles.push(path);
    this.#renderSelectedFiles();
  }

  #removeSelectedFile(path: string): void {
    this.#selectedFiles = this.#selectedFiles.filter((item) => item !== path);
    this.#renderSelectedFiles();
  }

  #clearSelectedFiles(): void {
    this.#selectedFiles = [];
    this.#renderSelectedFiles();
  }

  #renderSelectedFiles(): void {
    clearChildren(this.#attachmentListEl);
    this.#attachmentStripEl.hidden = this.#selectedFiles.length === 0;
    if (this.#selectedFiles.length === 0) return;

    this.#selectedFiles.forEach((path) => {
      const chip = h("span", { class: "chat-attachment-chip" }, [
        h("span", { class: "chat-attachment-chip-icon" }, [fileIcon(basename(path))]),
        h("span", { class: "chat-attachment-chip-label" }, [basename(path)]),
        h("button", {
          type: "button",
          class: "chat-attachment-chip-remove",
          title: "Remove file",
          onclick: (event: Event) => {
            event.preventDefault();
            this.#removeSelectedFile(path);
            this.#inputEl.focus();
          },
        }, ["×"]),
      ]);
      this.#attachmentListEl.appendChild(chip);
    });
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
                const selectedFiles = this.#selectedFiles.slice();
                this.#callbacks.onSendPrompt(opt.label, this.#fullAccess, selectedFiles);
                this.#clearSelectedFiles();
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
    if (isUser) {
      bubble.innerHTML = this.#renderUserMessageHtml(msg.content, []);
    } else {
      bubble.innerHTML = renderMarkdown(msg.content);
    }
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
    this.#syncComposerInset();
  }

  #hideStatus(): void {
    this.#statusEl.hidden = true;
    this.#syncComposerInset();
  }

  #scrollToBottom(): void {
    this.#cancelScrollAnimation();
    requestAnimationFrame(() => {
      this.#isProgrammaticScroll = true;
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#updateScrollToBottomButton();
      requestAnimationFrame(() => {
        this.#isProgrammaticScroll = false;
      });
    });
  }

  #scrollToBottomAnimated(durationMs: number): void {
    this.#cancelScrollAnimation();
    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    const startTop = this.#messagesEl.scrollTop;
    if (maxScrollTop <= startTop) {
      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#updateScrollToBottomButton();
      return;
    }

    let startTime = 0;
    this.#isProgrammaticScroll = true;
    const step = (time: number): void => {
      if (startTime === 0) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const easedProgress = easeInOutCubic(progress);
      const currentMaxScrollTop =
        this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
      this.#messagesEl.scrollTop =
        startTop + (currentMaxScrollTop - startTop) * easedProgress;
      this.#updateScrollToBottomButton();

      if (progress < 1) {
        this.#scrollAnimationFrame = requestAnimationFrame(step);
        return;
      }

      this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
      this.#hasUserScrolledUp = false;
      this.#updateScrollToBottomButton();
      this.#scrollAnimationFrame = null;
      requestAnimationFrame(() => {
        this.#isProgrammaticScroll = false;
      });
    };

    this.#scrollAnimationFrame = requestAnimationFrame(step);
  }

  #cancelScrollAnimation(): void {
    if (this.#scrollAnimationFrame === null) return;
    cancelAnimationFrame(this.#scrollAnimationFrame);
    this.#scrollAnimationFrame = null;
  }

  #onMessagesScroll(event: Event): void {
    if (this.#isProgrammaticScroll) {
      this.#updateScrollToBottomButton();
      return;
    }

    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    if (maxScrollTop <= 0) {
      this.#hasUserScrolledUp = false;
      this.#updateScrollToBottomButton();
      return;
    }

    const distanceFromBottom = maxScrollTop - this.#messagesEl.scrollTop;
    const threshold = Math.max(2, maxScrollTop * 0.05);
    if (distanceFromBottom <= threshold) {
      this.#hasUserScrolledUp = false;
    } else if (event.isTrusted) {
      // Only reveal the jump button after the user manually scrolls up.
      this.#hasUserScrolledUp = true;
    }

    this.#updateScrollToBottomButton();
  }

  #updateScrollToBottomButton(): void {
    const maxScrollTop = this.#messagesEl.scrollHeight - this.#messagesEl.clientHeight;
    if (maxScrollTop <= 0) {
      this.#scrollToBottomBtn.hidden = true;
      return;
    }

    const distanceFromBottom = maxScrollTop - this.#messagesEl.scrollTop;
    const threshold = Math.max(2, maxScrollTop * 0.05);
    this.#scrollToBottomBtn.hidden =
      distanceFromBottom <= threshold || !this.#hasUserScrolledUp;
  }

  #setPermission(fullAccess: boolean): void {
    this.#fullAccess = fullAccess;
    this.#permLabelEl.textContent = fullAccess ? "Full access" : "Default permissions";
    this.#permDetailsEl.classList.toggle("full-access", fullAccess);
    this.#permDefaultBtn.classList.toggle("selected", !fullAccess);
    this.#permFullBtn.classList.toggle("selected", fullAccess);
    this.#permDetailsEl.open = false;
  }

  #syncComposerInset(): void {
    const composerHeight = this.#composerEl.offsetHeight;
    if (composerHeight <= 0) return;
    const clearance = Math.max(170, composerHeight + 26);
    this.#messagesEl.style.paddingBottom = `${clearance}px`;
    this.#messagesEl.style.scrollPaddingBottom = `${clearance}px`;
  }

  #renderUserMessageHtml(rawText: string, selectedFiles: string[]): string {
    const parsed = parseAttachedFilesDirective(rawText);
    const files = uniqueFiles([...selectedFiles, ...parsed.files]);
    const cleanedText = parsed.text.trim();
    const parts: string[] = [];

    if (files.length > 0) {
      const fileTags = files
        .map((path) => `<span class="chat-file-chip-inline">${escapeHtml(basename(path))}</span>`)
        .join(" ");
      parts.push(
        `<div class="chat-user-files"><span class="chat-user-files-label">Attached files:</span>${fileTags}</div>`
      );
    }

    if (cleanedText) {
      parts.push(escapeHtml(cleanedText).replace(/\n/g, "<br>"));
    }

    return parts.join("");
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

function findMentionToken(
  text: string,
  cursor: number
): { start: number; end: number; query: string } | null {
  const clampedCursor = clamp(cursor, 0, text.length);
  const beforeCursor = text.slice(0, clampedCursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) return null;

  if (atIndex > 0 && !/\s/.test(text[atIndex - 1])) {
    return null;
  }

  const token = text.slice(atIndex + 1, clampedCursor);
  if (/\s/.test(token)) return null;

  return {
    start: atIndex,
    end: clampedCursor,
    query: token,
  };
}

function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split("/");
  const name = parts.pop() || path;
  return {
    name,
    dir: parts.join("/"),
  };
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "TS";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "toml") return "{}";
  if (ext === "md") return "MD";
  return "·";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function normalizePercent(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp(number, 0, 100);
}

function inferContextWindow(model: string | null): number | null {
  if (!model) return null;
  const normalized = model.toLowerCase();
  if (
    normalized.includes("claude")
    || normalized.includes("sonnet")
    || normalized.includes("opus")
    || normalized.includes("haiku")
  ) {
    return 200_000;
  }
  return null;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${Math.round(value)}`;
}

function parseAttachedFilesDirective(text: string): { text: string; files: string[] } {
  const files: string[] = [];
  const directivePattern = /<attached_files>\s*([\s\S]*?)<\/attached_files>/gi;
  const cleaned = text.replace(directivePattern, (_match, block) => {
    for (const rawLine of String(block).split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;
      const parsed = parseAttachedFileLine(line);
      if (parsed) files.push(parsed);
    }
    return "";
  });

  return {
    text: cleaned.replace(/\n{3,}/g, "\n\n"),
    files: uniqueFiles(files),
  };
}

function parseAttachedFileLine(line: string): string | null {
  const match = line.match(/^-+\s+(.+?)(?:\s+\(workspace:\s*(.+?)\))?$/);
  if (!match) return null;

  const workspacePath = match[2]?.trim();
  if (workspacePath) return workspacePath;

  const absolutePath = match[1]?.trim();
  if (!absolutePath) return null;
  return basename(absolutePath);
}

function uniqueFiles(files: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const normalized = file.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
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
