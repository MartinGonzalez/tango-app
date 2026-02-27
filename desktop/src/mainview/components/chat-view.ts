import { h, qs, clearChildren } from "../lib/dom.ts";
// Icons now use Material Symbols directly in HTML
import type {
  TranscriptMessage,
  ClaudeStreamEvent,
  ContentBlock,
  ToolApprovalRequest,
  Activity,
  SlashCommandEntry,
  StreamToolUseResult,
  StreamTodoEntry,
} from "../../shared/types.ts";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";

export type ChatCallbacks = {
  onSendPrompt: (
    prompt: string,
    fullAccess: boolean,
    selectedFiles?: string[]
  ) => void;
  onStopSession?: () => void;
  onOpenInFinder?: (path: string) => void;
  onSearchFiles?: (query: string) => Promise<string[]>;
  onSearchCommands?: (query: string) => Promise<SlashCommandEntry[]>;
};

type MentionMode = "file" | "command";

type MentionSuggestion = {
  label: string;
  detail: string;
  icon: string;
  kind: MentionMode;
  value: string;
};

export class ChatView {
  #el: HTMLElement;
  #headerEl: HTMLElement;
  #headerTitleEl: HTMLElement;
  #headerStageEl: HTMLElement;
  #headerMenuEl: HTMLElement;
  #headerMenuBtnEl: HTMLButtonElement;
  #headerOpenInFinderBtn: HTMLButtonElement;
  #messagesEl: HTMLElement;
  #composerEl: HTMLElement;
  #scrollToBottomBtn: HTMLButtonElement;
  #inputEl: HTMLTextAreaElement;
  #inputWrapEl: HTMLElement;
  #attachmentStripEl: HTMLElement;
  #attachmentListEl: HTMLElement;
  #addFileBtn: HTMLButtonElement;
  #sendBtn: HTMLElement;
  #stopBtn: HTMLElement;
  #mentionMenuEl: HTMLElement;
  #mentionListEl: HTMLElement;
  #mentionEmptyEl: HTMLElement;
  #contextDetailsEl: HTMLElement;
  #contextToggleBtnEl: HTMLButtonElement;
  #contextSummaryValueEl: HTMLElement;
  #contextUsedEl: HTMLElement;
  #contextTokensEl: HTMLElement;
  #contextHintEl: HTMLElement;
  #statusEl: HTMLElement;
  #permDetailsEl: HTMLElement;
  #permToggleBtnEl: HTMLButtonElement;
  #permLabelEl: HTMLElement;
  #permDefaultBtn: HTMLButtonElement;
  #permFullBtn: HTMLButtonElement;
  #fullAccess: boolean = true;
  #callbacks: ChatCallbacks;
  #isWaiting: boolean = false;
  #stagePath: string | null = null;
  #mentionVisible: boolean = false;
  #mentionMode: MentionMode | null = null;
  #mentionSelection: number = 0;
  #mentionRequestId: number = 0;
  #mentionSuggestions: MentionSuggestion[] = [];
  #selectedFiles: string[] = [];
  #toolUsesById: Map<string, { name: string; input: Record<string, unknown> }> = new Map();
  #hasUserScrolledUp: boolean = false;
  #isProgrammaticScroll: boolean = false;
  #onGlobalPointerDown: (event: Event) => void;
  #onGlobalKeyDown: (event: KeyboardEvent) => void;
  #onGlobalFocusIn: (event: FocusEvent) => void;
  #onWindowBlur: () => void;
  #scrollAnimationFrame: number | null = null;
  #composerResizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: ChatCallbacks) {
    this.#callbacks = callbacks;
    this.#onGlobalPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      this.#closeFloatingMenusForTarget(target);
      if (
        this.#mentionVisible
        && !(target && this.#inputWrapEl.contains(target))
      ) {
        this.#hideMentionMenu();
      }
    };
    this.#onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      this.#setHeaderMenuOpen(false);
      this.#setPermissionMenuOpen(false);
      this.#setContextMenuOpen(false);
      if (this.#mentionVisible) this.#hideMentionMenu();
    };
    this.#onGlobalFocusIn = (event: FocusEvent) => {
      this.#closeFloatingMenusForTarget(event.target as Node | null);
    };
    this.#onWindowBlur = () => {
      this.#setHeaderMenuOpen(false);
      this.#setPermissionMenuOpen(false);
      this.#setContextMenuOpen(false);
    };

    this.#headerTitleEl = h("span", { class: "chat-header-title" }, ["New session"]);
    this.#headerStageEl = h("span", {
      class: "chat-header-stage",
      hidden: true,
    });
    this.#headerOpenInFinderBtn = h(
      "button",
      {
        type: "button",
        class: "chat-header-menu-item",
        onclick: (e: Event) => {
          e.preventDefault();
          const path = this.#stagePath;
          if (!path) return;
          this.#callbacks.onOpenInFinder?.(path);
          this.#setHeaderMenuOpen(false);
        },
      },
      ["Open in Finder"]
    ) as HTMLButtonElement;

    this.#headerMenuBtnEl = h("button", {
      type: "button",
      class: "chat-header-menu-btn",
      title: "More",
      "aria-label": "More",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#setHeaderMenuOpen(!this.#isMenuOpen(this.#headerMenuEl));
      },
    }, [
      h("span", { class: "material-symbols-outlined", "aria-hidden": "true" }, ["more_vert"]),
    ]) as HTMLButtonElement;

    this.#headerMenuEl = h("div", { class: "chat-header-menu" }, [
      this.#headerMenuBtnEl,
      h("div", { class: "chat-header-menu-popover" }, [
        this.#headerOpenInFinderBtn,
      ]),
    ]);

    this.#headerEl = h("div", { class: "chat-header" }, [
      h("div", { class: "chat-header-meta" }, [
        this.#headerTitleEl,
        this.#headerStageEl,
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
    this.#inputEl.placeholder = "Type / for commands";
    this.#inputEl.rows = 1;
    this.#inputEl.addEventListener("keydown", (e) => this.#onInputKeyDown(e));
    this.#inputEl.addEventListener("input", () => {
      this.#resizeInput();
      void this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("click", () => {
      void this.#updateMentionSuggestions();
    });
    this.#inputEl.addEventListener("focus", () => {
      this.#setHeaderMenuOpen(false);
      this.#setPermissionMenuOpen(false);
      this.#setContextMenuOpen(false);
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

    this.#addFileBtn = h("button", {
      type: "button",
      class: "chat-add-btn",
      title: "Attach file",
      "aria-label": "Attach file",
      onclick: () => {
        this.#insertAttachToken();
      },
    }, ["+"]) as HTMLButtonElement;

    this.#sendBtn = h(
      "button",
      {
        class: "chat-send-btn",
        title: "Send",
        "aria-label": "Send",
        onclick: () => this.#send(),
      },
      [h("span", { class: "material-symbols-outlined", "aria-hidden": "true" }, ["arrow_upward"])]
    );

    this.#stopBtn = h(
      "button",
      {
        class: "chat-stop-btn",
        title: "Stop",
        "aria-label": "Stop",
        onclick: () => this.#stop(),
        hidden: true,
      },
      ["\u25A0"]
    );

    this.#mentionListEl = h("div", { class: "chat-mention-list" });
    this.#mentionEmptyEl = h("div", {
      class: "chat-mention-empty",
      hidden: true,
    }, ["No matches"]);
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
      type: "button",
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
      type: "button",
      class: "perm-menu-option",
      onclick: (e: Event) => {
        e.preventDefault();
        this.#setPermission(true);
      },
    }, [
      h("span", { class: "perm-menu-title" }, ["Full access"]),
      h("span", { class: "perm-menu-check" }, ["\u2713"]),
    ]) as HTMLButtonElement;

    this.#permToggleBtnEl = h("button", {
      type: "button",
      class: "perm-chip",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#setPermissionMenuOpen(!this.#isMenuOpen(this.#permDetailsEl));
      },
    }, [
      h("span", { class: "perm-chip-icon" }, ["\u26E8"]),
      this.#permLabelEl,
      h("span", { class: "perm-chip-caret" }, ["\u25BE"]),
    ]) as HTMLButtonElement;

    this.#permDetailsEl = h("div", { class: "perm-selector" }, [
      this.#permToggleBtnEl,
      h("div", { class: "perm-menu", role: "menu" }, [
        this.#permDefaultBtn,
        this.#permFullBtn,
      ]),
    ]);

    this.#contextSummaryValueEl = h("span", { class: "context-meter-value" }, ["--"]);
    this.#contextUsedEl = h("div", { class: "context-meter-line" }, ["--"]);
    this.#contextTokensEl = h("div", { class: "context-meter-line" }, [""]);
    this.#contextHintEl = h("div", { class: "context-meter-hint" }, [
      "Claude may automatically compact its context.",
    ]);
    this.#contextToggleBtnEl = h("button", {
      type: "button",
      class: "context-meter-btn",
      title: "Context window usage",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      onclick: (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#setContextMenuOpen(!this.#isMenuOpen(this.#contextDetailsEl));
      },
    }, [
      h("span", { class: "context-meter-spinner" }),
      this.#contextSummaryValueEl,
    ]) as HTMLButtonElement;
    this.#contextDetailsEl = h("div", {
      class: "context-meter",
      hidden: true,
    }, [
      this.#contextToggleBtnEl,
      h("div", { class: "context-meter-popover" }, [
        h("div", { class: "context-meter-title" }, ["Context window"]),
        this.#contextUsedEl,
        this.#contextTokensEl,
        this.#contextHintEl,
      ]),
    ]);

    const toggleRow = h("div", { class: "chat-perm-toggle-row" }, [
      h("div", { class: "chat-controls-left" }, [
        this.#addFileBtn,
        this.#permDetailsEl,
      ]),
      h("div", { class: "chat-controls-right" }, [
        this.#contextDetailsEl,
        this.#stopBtn,
        this.#sendBtn,
      ]),
    ]);
    this.#setPermission(true);

    const inputRow = h("div", { class: "chat-input-row" }, [
      this.#inputWrapEl,
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
    document.addEventListener("mousedown", this.#onGlobalPointerDown, true);
    document.addEventListener("keydown", this.#onGlobalKeyDown, true);
    document.addEventListener("focusin", this.#onGlobalFocusIn, true);
    window.addEventListener("blur", this.#onWindowBlur);
  }

  renderTranscript(messages: TranscriptMessage[]): void {
    clearChildren(this.#messagesEl);
    this.#toolUsesById.clear();
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
      const streamToolResult = isRecord(ev.tool_use_result)
        ? (ev.tool_use_result as StreamToolUseResult)
        : null;

      let hasToolResult = false;
      for (const block of content) {
        if (block.type === "tool_result") {
          hasToolResult = true;
          this.#hideStatus();
          const output = stringifyToolResultContent(block.content);
          const trackedTool = this.#toolUsesById.get(block.tool_use_id ?? "");
          this.#appendToolResult(
            block.tool_use_id ?? "",
            output,
            block.is_error === true,
            trackedTool?.name,
            trackedTool?.input,
            streamToolResult
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
    this.#toolUsesById.clear();
    this.#cancelScrollAnimation();
    this.#hasUserScrolledUp = false;
    this.#updateScrollToBottomButton();
    this.#isWaiting = false;
    this.#setHeaderMenuOpen(false);
    this.#setPermissionMenuOpen(false);
    this.#setContextMenuOpen(false);
    this.#hideStatus();
    this.#hideMentionMenu();
    this.#clearSelectedFiles();
  }

  setHeader(sessionTitle: string, stagePath: string | null): void {
    const title = sessionTitle.trim() || "New session";
    this.#headerTitleEl.textContent = title;

    this.#stagePath = stagePath;
    if (stagePath) {
      const name = basename(stagePath);
      this.#headerStageEl.textContent = name;
      this.#headerStageEl.title = stagePath;
      this.#headerStageEl.hidden = false;
      this.#headerOpenInFinderBtn.disabled = false;
    } else {
      this.#headerStageEl.textContent = "";
      this.#headerStageEl.removeAttribute("title");
      this.#headerStageEl.hidden = true;
      this.#headerOpenInFinderBtn.disabled = true;
      this.#setHeaderMenuOpen(false);
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
      this.#setContextMenuOpen(false);
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
    this.#syncComposerInset();
  }

  #hideStopButton(): void {
    this.#stopBtn.hidden = true;
    this.#sendBtn.hidden = false;
    this.#syncComposerInset();
  }

  #resizeInput(): void {
    this.#inputEl.style.height = "auto";
    this.#inputEl.style.height =
      Math.min(this.#inputEl.scrollHeight, 150) + "px";
  }

  async #updateMentionSuggestions(): Promise<void> {
    const cursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const text = this.#inputEl.value;
    const fileToken = findMentionToken(text, cursor);
    const commandToken = findSlashCommandToken(text, cursor);
    const requestId = ++this.#mentionRequestId;

    let mode: MentionMode | null = null;
    let token: { start: number; end: number; query: string } | null = null;
    let suggestions: MentionSuggestion[] = [];

    if (fileToken) {
      const provider = this.#callbacks.onSearchFiles;
      if (!provider) {
        this.#hideMentionMenu();
        return;
      }
      mode = "file";
      token = fileToken;
      try {
        const fileSuggestions = await provider(fileToken.query);
        suggestions = fileSuggestions.slice(0, 30).map((path) => {
          const { name, dir } = splitPath(path);
          return {
            kind: "file",
            value: path,
            label: name,
            detail: dir || "./",
            icon: fileIcon(name),
          };
        });
      } catch (error) {
        console.error("Failed to load @file suggestions:", error);
        this.#hideMentionMenu();
        return;
      }
    } else if (commandToken) {
      const provider = this.#callbacks.onSearchCommands;
      if (!provider) {
        this.#hideMentionMenu();
        return;
      }
      mode = "command";
      token = commandToken;
      try {
        const commandSuggestions = await provider(commandToken.query);
        suggestions = commandSuggestions.slice(0, 30).map((command) => ({
          kind: "command",
          value: command.name,
          label: `/${command.name}`,
          detail: command.source === "project" ? "Project command" : "User command",
          icon: "/",
        }));
      } catch (error) {
        console.error("Failed to load slash command suggestions:", error);
        this.#hideMentionMenu();
        return;
      }
    } else {
      this.#hideMentionMenu();
      return;
    }

    if (!mode || !token) {
      this.#hideMentionMenu();
      return;
    }

    if (requestId !== this.#mentionRequestId) return;

    const latestCursor = this.#inputEl.selectionStart ?? this.#inputEl.value.length;
    const latestToken = mode === "file"
      ? findMentionToken(this.#inputEl.value, latestCursor)
      : findSlashCommandToken(this.#inputEl.value, latestCursor);
    if (!latestToken) {
      this.#hideMentionMenu();
      return;
    }
    if (latestToken.start !== token.start) {
      this.#hideMentionMenu();
      return;
    }

    this.#mentionMode = mode;
    this.#mentionSuggestions = suggestions;
    if (this.#mentionSuggestions.length === 0) {
      clearChildren(this.#mentionListEl);
      this.#mentionEmptyEl.textContent = mode === "file"
        ? "No matching files"
        : "No matching commands";
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

    this.#mentionSuggestions.forEach((suggestion, index) => {
      const option = h("button", {
        type: "button",
        class: `chat-mention-option${index === this.#mentionSelection ? " active" : ""}`,
      }, [
        h("span", { class: "chat-mention-icon" }, [suggestion.icon]),
        h("span", { class: "chat-mention-name" }, [suggestion.label]),
        h("span", { class: "chat-mention-dir" }, [suggestion.detail]),
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
    const mode = this.#mentionMode;
    if (!mode) {
      this.#hideMentionMenu();
      return;
    }

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
    const token = mode === "file"
      ? findMentionToken(value, cursor)
      : findSlashCommandToken(value, cursor);
    if (!token) {
      this.#hideMentionMenu();
      return;
    }

    if (mode === "file") {
      const before = value.slice(0, token.start);
      const after = value.slice(token.end);
      const needsSingleSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
      const inserted = `${before}${needsSingleSpace ? " " : ""}${after}`;

      this.#inputEl.value = inserted;
      const nextCursor = before.length + (needsSingleSpace ? 1 : 0);
      this.#inputEl.setSelectionRange(nextCursor, nextCursor);
      this.#addSelectedFile(selected.value);
    } else {
      const before = value.slice(0, token.start);
      const after = value.slice(token.end);
      const commandText = `/${selected.value}`;
      const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
      const inserted = `${before}${commandText}${needsTrailingSpace ? " " : ""}${after}`;
      const nextCursor = before.length + commandText.length + (needsTrailingSpace ? 1 : 0);

      this.#inputEl.value = inserted;
      this.#inputEl.setSelectionRange(nextCursor, nextCursor);
    }

    this.#resizeInput();
    this.#hideMentionMenu();
    this.#inputEl.focus();
  }

  #hideMentionMenu(): void {
    this.#mentionVisible = false;
    this.#mentionMode = null;
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
      if (typeof block.id === "string" && block.id.trim()) {
        this.#toolUsesById.set(block.id, {
          name: String(block.name ?? ""),
          input: isRecord(block.input) ? block.input : {},
        });
      }

      // AskUserQuestion — render as an interactive prompt
      if (block.name === "AskUserQuestion") {
        this.#renderAskUserQuestion(block);
        return;
      }

      const summary = summarizeToolInput(block.name, block.input);
      const details = resolveToolEventDetails(block.name, block.input);
      const isSkillInvocationEvent = isSkillInvocation(block.name, block.input);
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          block.name,
          summary ? ` ${summary}` : "",
        ]),
        details.content ? h("div", { class: "tool-input" }) : null,
      ].filter(Boolean) as HTMLElement[]) as HTMLDetailsElement;
      detailsPanel.open = shouldExpandTool(block.name) || isSkillInvocationEvent;

      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel,
      ]);
      toolEvent.classList.toggle("skill-event", isSkillInvocationEvent);
      if (details.content) {
        const detailsEl = qs(".tool-input", toolEvent) as HTMLElement | null;
        if (detailsEl) {
          detailsEl.innerHTML = details.raw
            ? details.content
            : renderToolContent(details.content);
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
    toolUseId: string,
    output: string,
    isError: boolean,
    toolName?: string,
    toolInput?: Record<string, unknown>,
    streamToolResult: StreamToolUseResult | null = null
  ): void {
    if (toolUseId) {
      this.#toolUsesById.delete(toolUseId);
    }

    const normalizedToolName = String(toolName ?? "").trim();
    const isTodoWriteResult = normalizedToolName.toLowerCase() === "todowrite"
      || hasTodoWritePayload(streamToolResult, toolInput);
    const isSkillResult = isSkillInvocationResult(
      normalizedToolName,
      toolInput,
      streamToolResult
    );
    const baseTitle = normalizedToolName
      || (isTodoWriteResult ? "TodoWrite" : isSkillResult ? "Skill" : "Tool");
    const title = `${baseTitle} ${isError ? "error" : "result"}`;

    const card = h("div", {
      class: `chat-tool-output${isError ? " error" : ""}`,
    }, [
      h("details", { class: "tool-result-details" }, [
        h("summary", { class: "tool-result-header" }, [title]),
        h("div", { class: "tool-result-output" }),
      ]) as HTMLDetailsElement,
    ]);

    const details = qs(".tool-result-details", card) as HTMLDetailsElement | null;
    const outputEl = qs(".tool-result-output", card) as HTMLElement | null;
    if (details) {
      details.open = isError || isTodoWriteResult || isSkillResult;
    }

    if (outputEl) {
      if (isTodoWriteResult) {
        outputEl.innerHTML = formatTodoWriteResult(output, streamToolResult, toolInput);
      } else if (isSkillResult) {
        outputEl.innerHTML = formatSkillInvocationResult(
          normalizedToolName,
          output,
          streamToolResult,
          toolInput
        );
      } else {
        outputEl.innerHTML = renderToolContent(output);
      }
    }

    this.#messagesEl.appendChild(card);
  }

  // ── Render transcript messages (historical) ─────────────────────

  #appendTranscriptMessage(msg: TranscriptMessage): void {
    const isUser = msg.role === "user";
    if (msg.toolName && !isUser) {
      const summary = summarizeToolInput(msg.toolName, msg.toolInput);
      const details = resolveToolEventDetails(msg.toolName, msg.toolInput ?? {});
      const isSkillInvocationEvent = isSkillInvocation(msg.toolName, msg.toolInput);
      const detailsPanel = h("details", { class: "tool-details" }, [
        h("summary", { class: "tool-header" }, [
          msg.toolName,
          summary ? ` ${summary}` : "",
        ]),
        details.content ? h("div", { class: "tool-input" }) : null,
      ].filter(Boolean) as HTMLElement[]) as HTMLDetailsElement;
      detailsPanel.open = shouldExpandTool(msg.toolName) || isSkillInvocationEvent;

      const toolEvent = h("div", { class: "chat-tool-event" }, [
        detailsPanel,
      ]);
      toolEvent.classList.toggle("skill-event", isSkillInvocationEvent);
      if (details.content) {
        const detailsEl = qs(".tool-input", toolEvent) as HTMLElement | null;
        if (detailsEl) {
          detailsEl.innerHTML = details.raw
            ? details.content
            : renderToolContent(details.content);
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

  #isMenuOpen(menuEl: HTMLElement): boolean {
    return menuEl.classList.contains("open");
  }

  #setMenuOpen(menuEl: HTMLElement, toggleBtn: HTMLButtonElement, open: boolean): void {
    menuEl.classList.toggle("open", open);
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  #setHeaderMenuOpen(open: boolean): void {
    if (open) {
      this.#setPermissionMenuOpen(false);
      this.#setContextMenuOpen(false);
    }
    this.#setMenuOpen(this.#headerMenuEl, this.#headerMenuBtnEl, open);
  }

  #setPermissionMenuOpen(open: boolean): void {
    if (open) {
      this.#setHeaderMenuOpen(false);
      this.#setContextMenuOpen(false);
    }
    this.#setMenuOpen(this.#permDetailsEl, this.#permToggleBtnEl, open);
  }

  #setContextMenuOpen(open: boolean): void {
    if (open) {
      this.#setHeaderMenuOpen(false);
      this.#setPermissionMenuOpen(false);
    }
    this.#setMenuOpen(this.#contextDetailsEl, this.#contextToggleBtnEl, open);
  }

  #closeFloatingMenusForTarget(target: Node | null): void {
    if (this.#isMenuOpen(this.#headerMenuEl) && !(target && this.#headerMenuEl.contains(target))) {
      this.#setHeaderMenuOpen(false);
    }
    if (this.#isMenuOpen(this.#permDetailsEl) && !(target && this.#permDetailsEl.contains(target))) {
      this.#setPermissionMenuOpen(false);
    }
    if (this.#isMenuOpen(this.#contextDetailsEl) && !(target && this.#contextDetailsEl.contains(target))) {
      this.#setContextMenuOpen(false);
    }
  }

  #setPermission(fullAccess: boolean): void {
    this.#fullAccess = fullAccess;
    this.#permLabelEl.textContent = fullAccess ? "Full access" : "Default permissions";
    this.#permDetailsEl.classList.toggle("full-access", fullAccess);
    this.#permDefaultBtn.classList.toggle("selected", !fullAccess);
    this.#permFullBtn.classList.toggle("selected", fullAccess);
    this.#setPermissionMenuOpen(false);
  }

  #syncComposerInset(): void {
    const composerHeight = this.#composerEl.offsetHeight;
    if (composerHeight <= 0) return;
    const clearance = Math.max(170, composerHeight + 26);
    this.#messagesEl.style.paddingBottom = `${clearance}px`;
    this.#messagesEl.style.scrollPaddingBottom = `${clearance}px`;
  }

  #insertAttachToken(): void {
    const value = this.#inputEl.value;
    const cursor = this.#inputEl.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const inserted = `${before}${needsSpace ? " " : ""}@${after}`;
    const nextCursor = before.length + (needsSpace ? 2 : 1);

    this.#inputEl.value = inserted;
    this.#inputEl.setSelectionRange(nextCursor, nextCursor);
    this.#inputEl.focus();
    this.#resizeInput();
    void this.#updateMentionSuggestions();
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
    Skill: "\u2726",
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

function findSlashCommandToken(
  text: string,
  cursor: number
): { start: number; end: number; query: string } | null {
  const clampedCursor = clamp(cursor, 0, text.length);
  const beforeCursor = text.slice(0, clampedCursor);
  const slashIndex = beforeCursor.lastIndexOf("/");
  if (slashIndex < 0) return null;

  if (slashIndex > 0 && !/\s/.test(text[slashIndex - 1])) {
    return null;
  }

  const token = text.slice(slashIndex + 1, clampedCursor);
  if (/\s/.test(token)) return null;

  return {
    start: slashIndex,
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

  const parsedPath = match[2]?.trim();
  if (parsedPath) return parsedPath;

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

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function taskSkillTypeFromInput(input?: Record<string, unknown>): string | null {
  if (!input) return null;
  return readNonEmptyString(input.subagent_type ?? input.subagentType);
}

function skillNameFromInput(
  toolName: string,
  input?: Record<string, unknown>
): string | null {
  if (!input) return null;
  const normalized = toolName.trim().toLowerCase();
  if (normalized === "task") {
    return taskSkillTypeFromInput(input);
  }
  if (normalized === "skill") {
    return readNonEmptyString(input.skill ?? input.commandName ?? input.command_name);
  }
  return null;
}

function isSkillInvocation(
  toolName: string,
  input?: Record<string, unknown>
): boolean {
  return skillNameFromInput(toolName, input) !== null;
}

function skillInvocationSource(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  if (normalized === "skill") return "Skill tool";
  if (normalized === "task") return "Task subagent";
  return "Skill";
}

function skillCommandNameFromResult(
  streamToolResult: StreamToolUseResult | null
): string | null {
  return readNonEmptyString(
    streamToolResult?.commandName ?? streamToolResult?.command_name
  );
}

function isSkillInvocationResult(
  toolName: string,
  toolInput?: Record<string, unknown>,
  streamToolResult: StreamToolUseResult | null = null
): boolean {
  if (isSkillInvocation(toolName, toolInput)) return true;
  if (skillCommandNameFromResult(streamToolResult)) return true;
  return false;
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
    case "Task": {
      const skillName = skillNameFromInput(toolName, input);
      if (skillName) {
        const description = readNonEmptyString(input.description);
        const skillSummary = `skill ${skillName}`;
        return description
          ? `${skillSummary} · ${description.slice(0, 40)}`
          : skillSummary;
      }
      return String(input.description ?? input.prompt ?? "").slice(0, 60);
    }
    case "Skill": {
      const skillName = skillNameFromInput(toolName, input);
      if (!skillName) {
        return String(input.args ?? input.prompt ?? "").slice(0, 60);
      }
      const args = readNonEmptyString(input.args ?? input.prompt);
      return args
        ? `skill ${skillName} · ${args.slice(0, 36)}`
        : `skill ${skillName}`;
    }
    case "TodoWrite": {
      const todos = extractTodoEntries(input.todos);
      if (todos.length === 0) return "";
      const completed = todos.filter((todo) => normalizeTodoStatus(todo.status) === "completed").length;
      return `${completed}/${todos.length} completed`;
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function normalizeTodoStatus(status: string): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "done") return "completed";
  if (normalized === "in-progress") return "in_progress";
  if (normalized === "todo") return "pending";
  return normalized || "pending";
}

function formatTodoStatus(status: string): string {
  return normalizeTodoStatus(status).replace(/_/g, " ");
}

function extractTodoEntries(value: unknown): StreamTodoEntry[] {
  if (!Array.isArray(value)) return [];

  const todos: StreamTodoEntry[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const content = String(raw.content ?? "").trim();
    if (!content) continue;
    const status = normalizeTodoStatus(String(raw.status ?? "pending"));
    const activeFormRaw = raw.activeForm ?? raw.active_form;
    const activeForm = typeof activeFormRaw === "string" && activeFormRaw.trim()
      ? activeFormRaw.trim()
      : undefined;
    todos.push({ ...raw, content, status, activeForm });
  }

  return todos;
}

function formatTodoList(todos: StreamTodoEntry[]): string {
  if (todos.length === 0) {
    return '<div class="todo-write-empty">No todos</div>';
  }

  const items = todos
    .map((todo) => {
      const completed = normalizeTodoStatus(todo.status) === "completed";
      const status = escapeHtml(formatTodoStatus(todo.status));
      return `<li class="todo-write-item${completed ? " done" : ""}">`
        + `<span class="todo-write-check${completed ? " done" : ""}" aria-hidden="true"></span>`
        + `<span class="todo-write-label">${escapeHtml(todo.content)}</span>`
        + `<span class="todo-write-status">(${status})</span>`
        + "</li>";
    })
    .join("");

  return `<ul class="todo-write-list">${items}</ul>`;
}

function formatTodoSection(title: string, bodyHtml: string): string {
  return `<section class="todo-write-section">`
    + `<h4 class="todo-write-section-title">${escapeHtml(title)}</h4>`
    + `${bodyHtml}`
    + "</section>";
}

function formatTodoMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `<div class="todo-write-message">${escapeHtml(trimmed).replace(/\n/g, "<br>")}</div>`;
}

function summarizeTodoStatusChanges(
  oldTodos: StreamTodoEntry[],
  newTodos: StreamTodoEntry[]
): string[] {
  const previous = new Map<string, string>();
  for (const todo of oldTodos) {
    previous.set(todo.content, normalizeTodoStatus(todo.status));
  }

  const changes: string[] = [];
  for (const todo of newTodos) {
    const nextStatus = normalizeTodoStatus(todo.status);
    const before = previous.get(todo.content);
    if (!before) {
      changes.push(`${todo.content}: added (${formatTodoStatus(nextStatus)})`);
    } else if (before !== nextStatus) {
      changes.push(`${todo.content}: ${formatTodoStatus(before)} -> ${formatTodoStatus(nextStatus)}`);
    }
    previous.delete(todo.content);
  }

  for (const [content, before] of previous) {
    changes.push(`${content}: removed (was ${formatTodoStatus(before)})`);
  }

  return changes;
}

function hasTodoWritePayload(
  streamToolResult: StreamToolUseResult | null,
  toolInput?: Record<string, unknown>
): boolean {
  if (extractTodoEntries(toolInput?.todos).length > 0) return true;
  if (extractTodoEntries(streamToolResult?.oldTodos).length > 0) return true;
  if (extractTodoEntries(streamToolResult?.newTodos).length > 0) return true;
  return false;
}

function formatTodoWriteResult(
  output: string,
  streamToolResult: StreamToolUseResult | null,
  toolInput?: Record<string, unknown>
): string {
  const sections: string[] = [formatTodoMessage(output)].filter(Boolean);

  const inputTodos = extractTodoEntries(toolInput?.todos);
  if (inputTodos.length > 0) {
    sections.push(formatTodoSection("Input", formatTodoList(inputTodos)));
  }

  const oldTodos = extractTodoEntries(streamToolResult?.oldTodos);
  const newTodos = extractTodoEntries(streamToolResult?.newTodos);

  if (newTodos.length > 0) {
    sections.push(formatTodoSection("Current todos", formatTodoList(newTodos)));
  } else if (oldTodos.length > 0) {
    sections.push(formatTodoSection("Todos", formatTodoList(oldTodos)));
  }

  const changes = summarizeTodoStatusChanges(oldTodos, newTodos);
  if (changes.length > 0) {
    const changesHtml = `<ul class="todo-write-changes">`
      + changes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
      + "</ul>";
    sections.push(formatTodoSection("Changes", changesHtml));
  }

  if (sections.length === 0) {
    return '<div class="todo-write-view"><div class="todo-write-empty">(empty result)</div></div>';
  }

  return `<div class="todo-write-view">${sections.join("")}</div>`;
}

function formatTodoWriteInput(input: Record<string, unknown>): string | null {
  const todos = extractTodoEntries(input.todos);
  if (todos.length === 0) return null;
  return `<div class="todo-write-view">${formatTodoSection("Input", formatTodoList(todos))}</div>`;
}

function formatTodoWriteInputText(input: Record<string, unknown>): string | null {
  const todos = extractTodoEntries(input.todos);
  if (todos.length === 0) return null;

  const lines = todos.map((todo) => {
    const completed = normalizeTodoStatus(todo.status) === "completed";
    return `[${completed ? "x" : " "}] ${todo.content} (${formatTodoStatus(todo.status)})`;
  });
  return lines.join("\n");
}

function formatSkillInvocationInput(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  const skillName = skillNameFromInput(toolName, input);
  if (!skillName) return null;

  const description = readNonEmptyString(input.description);
  const contextLabel = toolName.trim().toLowerCase() === "skill" ? "Args" : "Prompt";
  const contextRaw = readNonEmptyString(input.args ?? input.prompt);
  const context = contextRaw && contextRaw.length > 1800
    ? `${contextRaw.slice(0, 1800)}...`
    : contextRaw;

  const top = `<div class="task-skill-top">`
    + `<span class="task-skill-badge">Skill</span>`
    + `<code class="task-skill-type">${escapeHtml(skillName)}</code>`
    + `<span class="task-skill-source">${escapeHtml(skillInvocationSource(toolName))}</span>`
    + `</div>`;
  const desc = description
    ? `<div class="task-skill-description">${escapeHtml(description)}</div>`
    : "";
  const contextHtml = context
    ? `<div class="task-skill-context-label">${escapeHtml(contextLabel)}</div>`
      + `<pre class="task-skill-prompt">${escapeHtml(context)}</pre>`
    : "";

  return `<div class="task-skill-card">${top}${desc}${contextHtml}</div>`;
}

function formatSkillInvocationResult(
  toolName: string,
  output: string,
  streamToolResult: StreamToolUseResult | null,
  toolInput?: Record<string, unknown>
): string {
  const fromInput = skillNameFromInput(toolName, toolInput);
  const fromResult = skillCommandNameFromResult(streamToolResult);
  const skillName = fromInput ?? fromResult ?? "unknown";
  const success = readBoolean(streamToolResult?.success);
  const message = readNonEmptyString(output);
  const successChip = success === null
    ? ""
    : `<span class="task-skill-status${success ? " ok" : " fail"}">`
      + `${success ? "success" : "failed"}`
      + `</span>`;

  const top = `<div class="task-skill-top">`
    + `<span class="task-skill-badge">Skill</span>`
    + `<code class="task-skill-type">${escapeHtml(skillName)}</code>`
    + `${successChip}`
    + `</div>`;
  const messageHtml = message
    ? `<div class="task-skill-description">${escapeHtml(message).replace(/\n/g, "<br>")}</div>`
    : "";
  const resultRows: string[] = [];
  if (fromResult && fromResult !== fromInput) {
    resultRows.push(`<li><strong>Command:</strong> ${escapeHtml(fromResult)}</li>`);
  }
  if (success !== null) {
    resultRows.push(`<li><strong>Success:</strong> ${success ? "true" : "false"}</li>`);
  }
  const resultMeta = resultRows.length > 0
    ? `<ul class="task-skill-result-meta">${resultRows.join("")}</ul>`
    : "";

  return `<div class="task-skill-card">${top}${messageHtml}${resultMeta}</div>`;
}

function resolveToolEventDetails(
  toolName: string,
  input: Record<string, unknown>
): { content: string | null; raw: boolean } {
  if (toolName.toLowerCase() === "todowrite") {
    return { content: formatTodoWriteInput(input), raw: true };
  }

  if (isSkillInvocation(toolName, input)) {
    return { content: formatSkillInvocationInput(toolName, input), raw: true };
  }

  return { content: formatToolDetails(toolName, input), raw: false };
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
    case "Task": {
      const skillName = skillNameFromInput(toolName, input);
      if (!skillName) return null;
      const description = readNonEmptyString(input.description);
      const prompt = readNonEmptyString(input.prompt);
      return [
        `Skill: ${skillName}`,
        description ? `Description: ${description}` : null,
        prompt ? `Prompt:\n${prompt}` : null,
      ].filter(Boolean).join("\n\n");
    }
    case "Skill": {
      const skillName = skillNameFromInput(toolName, input);
      if (!skillName) return null;
      const args = readNonEmptyString(input.args ?? input.prompt);
      return [
        `Skill: ${skillName}`,
        args ? `Args:\n${args}` : null,
      ].filter(Boolean).join("\n\n");
    }
    case "TodoWrite":
      return formatTodoWriteInputText(input);
    default:
      return null;
  }
}

const CODE_PLACEHOLDER_PATTERN = /^@@CODEBLOCKTOKEN(\d+)@@$/;
const CODE_PLACEHOLDER_GLOBAL_PATTERN = /@@CODEBLOCKTOKEN(\d+)@@/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const LIST_ITEM_PATTERN = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const HORIZONTAL_RULE_PATTERN = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const INLINE_PLACEHOLDER_PATTERN = /@@INLINEMDTOKEN(\d+)@@/g;
type TableAlignment = "left" | "center" | "right";

export function renderMarkdown(text: string): string {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return "";

  const codeBlocks: string[] = [];
  const withCodePlaceholders = normalized.replace(
    /```([^\n`]*)\n?([\s\S]*?)```/g,
    (_match, rawLanguage, code, offset, source) => {
      const codeText = String(code).replace(/\n$/, "");
      const language = normalizeCodeLanguageTag(String(rawLanguage ?? ""));
      const diffFilePath = language === "diff"
        ? inferDiffFilePathFromContext(String(source ?? normalized), Number(offset ?? 0))
        : null;
      const renderedBlock = language === "diff"
        ? renderInlineDiff(codeText, diffFilePath)
        : renderCodeBlock(codeText, language);
      const index = codeBlocks.push(renderedBlock) - 1;
      return `@@CODEBLOCKTOKEN${index}@@`;
    }
  );

  const rendered = renderMarkdownBlocks(withCodePlaceholders);
  return rendered.replace(CODE_PLACEHOLDER_GLOBAL_PATTERN, (_match, idx) => {
    const block = codeBlocks[Number(idx)];
    return block ?? "";
  });
}

function renderMarkdownBlocks(source: string): string {
  const lines = source.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (CODE_PLACEHOLDER_PATTERN.test(trimmed)) {
      blocks.push(trimmed);
      i++;
      continue;
    }

    const heading = trimmed.match(HEADING_PATTERN);
    if (heading) {
      const level = heading[1].length;
      const body = renderInlineMarkdown(heading[2].trim());
      blocks.push(`<h${level}>${body}</h${level}>`);
      i++;
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(trimmed)) {
      blocks.push("<hr>");
      i++;
      continue;
    }

    const table = tryRenderMarkdownTable(lines, i);
    if (table) {
      blocks.push(table.html);
      i = table.nextIndex;
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const quoteLine = lines[i];
        if (!quoteLine.trim()) {
          quoteLines.push("");
          i++;
          continue;
        }

        const quoteMatch = quoteLine.match(BLOCKQUOTE_PATTERN);
        if (!quoteMatch) break;
        quoteLines.push(quoteMatch[1]);
        i++;
      }

      const quoteContent = renderMarkdownBlocks(quoteLines.join("\n"));
      blocks.push(`<blockquote>${quoteContent || "<p></p>"}</blockquote>`);
      continue;
    }

    const listItem = matchListItem(line);
    if (listItem) {
      const [listHtml, nextIndex] = renderMarkdownList(
        lines,
        i,
        listItem.indent,
        listItem.ordered
      );
      blocks.push(listHtml);
      i = nextIndex;
      continue;
    }

    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();
      if (!nextTrimmed) break;
      if (CODE_PLACEHOLDER_PATTERN.test(nextTrimmed)) break;
      if (HEADING_PATTERN.test(nextTrimmed)) break;
      if (HORIZONTAL_RULE_PATTERN.test(nextTrimmed)) break;
      if (BLOCKQUOTE_PATTERN.test(nextLine)) break;
      if (matchListItem(nextLine)) break;
      paragraphLines.push(nextLine);
      i++;
    }

    const paragraphHtml = renderInlineMarkdown(
      paragraphLines.map((part) => part.trim()).join("\n")
    ).replace(/\n/g, "<br>");
    blocks.push(`<p>${paragraphHtml}</p>`);
  }

  return blocks.join("");
}

function tryRenderMarkdownTable(
  lines: string[],
  startIndex: number
): { html: string; nextIndex: number } | null {
  if (startIndex + 1 >= lines.length) return null;
  const headerLine = lines[startIndex];
  const dividerLine = lines[startIndex + 1];

  if (!headerLine.includes("|")) return null;
  const headerCells = splitMarkdownTableRow(headerLine);
  if (headerCells.length === 0) return null;

  const alignments = parseMarkdownTableDivider(dividerLine, headerCells.length);
  if (!alignments) return null;

  let i = startIndex + 2;
  const rowCells: string[][] = [];

  while (i < lines.length) {
    const rowLine = lines[i];
    const rowTrimmed = rowLine.trim();
    if (!rowTrimmed) break;
    if (CODE_PLACEHOLDER_PATTERN.test(rowTrimmed)) break;
    if (HEADING_PATTERN.test(rowTrimmed)) break;
    if (HORIZONTAL_RULE_PATTERN.test(rowTrimmed)) break;
    if (BLOCKQUOTE_PATTERN.test(rowLine)) break;
    if (matchListItem(rowLine)) break;
    if (!rowLine.includes("|")) break;

    const parsed = splitMarkdownTableRow(rowLine);
    if (parsed.length === 0) break;
    rowCells.push(normalizeMarkdownTableRow(parsed, headerCells.length));
    i++;
  }

  const headerHtml = normalizeMarkdownTableRow(headerCells, headerCells.length)
    .map((cell, idx) => {
      const alignClass = `md-align-${alignments[idx] ?? "left"}`;
      return `<th class="${alignClass}">${renderInlineMarkdown(cell)}</th>`;
    })
    .join("");
  const bodyHtml = rowCells
    .map((cells) => {
      const rowHtml = cells
        .map((cell, idx) => {
          const alignClass = `md-align-${alignments[idx] ?? "left"}`;
          return `<td class="${alignClass}">${renderInlineMarkdown(cell)}</td>`;
        })
        .join("");
      return `<tr>${rowHtml}</tr>`;
    })
    .join("");

  const bodySection = bodyHtml ? `<tbody>${bodyHtml}</tbody>` : "";
  return {
    html: `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headerHtml}</tr></thead>${bodySection}</table></div>`,
    nextIndex: i,
  };
}

function renderMarkdownList(
  lines: string[],
  startIndex: number,
  listIndent: number,
  ordered: boolean
): [string, number] {
  const tag = ordered ? "ol" : "ul";
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }
    if (i >= lines.length) break;

    const item = matchListItem(lines[i]);
    if (!item) break;
    if (item.indent < listIndent) break;
    if (item.indent > listIndent) break;
    if (item.ordered !== ordered) break;

    i++;
    const textLines: string[] = [];
    const nestedLists: string[] = [];
    if (item.content) {
      textLines.push(item.content);
    }

    while (i < lines.length) {
      const currentLine = lines[i];
      const trimmed = currentLine.trim();

      if (!trimmed) {
        const nextNonEmpty = findNextNonEmptyLine(lines, i + 1);
        if (nextNonEmpty < 0) {
          i = lines.length;
          break;
        }

        const nextList = matchListItem(lines[nextNonEmpty]);
        if (nextList && nextList.indent <= listIndent) {
          break;
        }

        if (textLines.length > 0 && textLines[textLines.length - 1] !== "") {
          textLines.push("");
        }
        i = nextNonEmpty;
        continue;
      }

      const nestedItem = matchListItem(currentLine);
      if (nestedItem) {
        if (nestedItem.indent > listIndent) {
          const [nestedHtml, nextIndex] = renderMarkdownList(
            lines,
            i,
            nestedItem.indent,
            nestedItem.ordered
          );
          nestedLists.push(nestedHtml);
          i = nextIndex;
          continue;
        }
        break;
      }

      if (leadingIndentWidth(currentLine) > listIndent) {
        textLines.push(trimmed);
        i++;
        continue;
      }

      break;
    }

    const textHtml = textLines.length > 0
      ? renderInlineMarkdown(textLines.join("\n")).replace(/\n/g, "<br>")
      : "";
    items.push(`<li>${textHtml}${nestedLists.join("")}</li>`);
  }

  return [`<${tag}>${items.join("")}</${tag}>`, i];
}

function matchListItem(
  line: string
): {
  indent: number;
  ordered: boolean;
  content: string;
} | null {
  const match = line.match(LIST_ITEM_PATTERN);
  if (!match) return null;

  return {
    indent: leadingIndentWidth(match[1] ?? ""),
    ordered: Boolean(match[3]),
    content: String(match[4] ?? "").trim(),
  };
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let row = trimmed;
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const ch of row) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (escaped) {
    current += "\\";
  }
  cells.push(current.trim());
  return cells;
}

function parseMarkdownTableDivider(
  line: string,
  columnCount: number
): TableAlignment[] | null {
  const cells = splitMarkdownTableRow(line);
  if (cells.length !== columnCount) return null;

  const alignments: TableAlignment[] = [];
  for (const rawCell of cells) {
    const cell = rawCell.trim();
    if (!/^:?-{3,}:?$/.test(cell)) return null;
    const alignLeft = cell.startsWith(":");
    const alignRight = cell.endsWith(":");
    if (alignLeft && alignRight) {
      alignments.push("center");
    } else if (alignRight) {
      alignments.push("right");
    } else {
      alignments.push("left");
    }
  }

  return alignments;
}

function normalizeMarkdownTableRow(row: string[], targetLength: number): string[] {
  if (row.length === targetLength) return row;
  if (row.length > targetLength) return row.slice(0, targetLength);

  const normalized = row.slice();
  while (normalized.length < targetLength) {
    normalized.push("");
  }
  return normalized;
}

function findNextNonEmptyLine(lines: string[], startIndex: number): number {
  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i].trim()) return i;
  }
  return -1;
}

function leadingIndentWidth(value: string): number {
  let width = 0;
  for (const ch of value) {
    if (ch === " ") {
      width += 1;
      continue;
    }
    if (ch === "\t") {
      width += 4;
      continue;
    }
    break;
  }
  return width;
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  const placeholders: string[] = [];
  const stash = (value: string): string => {
    const index = placeholders.push(value) - 1;
    return `@@INLINEMDTOKEN${index}@@`;
  };

  html = html.replace(/`([^`\n]+)`/g, (_match, code) => {
    return stash(`<code class="inline-code">${code}</code>`);
  });

  html = html.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
    (_match, label, href, title) => {
      const safeHref = sanitizeLinkHref(String(href));
      if (!safeHref) return label;
      const titleAttr = title ? ` title="${escapeHtml(String(title))}"` : "";
      return stash(
        `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`
      );
    }
  );

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  html = html.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)(?=$|[\s).,!?:;])/g,
    (_match, prefix, url) => {
      const safeHref = sanitizeLinkHref(String(url));
      if (!safeHref) return `${prefix}${url}`;
      return `${prefix}<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    }
  );

  return html.replace(INLINE_PLACEHOLDER_PATTERN, (_match, idx) => {
    return placeholders[Number(idx)] ?? "";
  });
}

function sanitizeLinkHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (
    lowered.startsWith("javascript:")
    || lowered.startsWith("data:")
    || lowered.startsWith("vbscript:")
  ) {
    return null;
  }

  if (
    lowered.startsWith("http://")
    || lowered.startsWith("https://")
    || lowered.startsWith("mailto:")
    || lowered.startsWith("#")
    || lowered.startsWith("/")
  ) {
    return escapeHtml(value);
  }

  return null;
}

function renderCodeBlock(code: string, language: string | null): string {
  const highlighted = highlightCodeBlock(code, language);
  const normalizedLanguage = language ?? "text";
  const preClass = `code-block language-${normalizedLanguage}${language ? " has-language" : ""}`;
  const codeClass = `language-${normalizedLanguage}`;
  const languageLabel = language
    ? `<span class="code-block-lang">${escapeHtml(formatLanguageLabel(language))}</span>`
    : "";
  return `<pre class="${preClass}">${languageLabel}<code class="${codeClass}">${highlighted}</code></pre>`;
}

function highlightCodeBlock(code: string, language: string | null): string {
  if (!language || code.length > 20000) {
    return escapeHtml(code);
  }

  const prism = resolvePrism();
  if (!prism) {
    return escapeHtml(code);
  }

  const grammar = resolveGrammar(prism.languages, language);
  if (!grammar) {
    return escapeHtml(code);
  }

  try {
    return prism.highlight(code, grammar, language);
  } catch {
    return escapeHtml(code);
  }
}

function normalizeCodeLanguageTag(language: string): string | null {
  const token = language.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!token) return null;

  const map: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    c: "c",
    h: "c",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    kt: "kotlin",
    py: "python",
    rb: "ruby",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    html: "markup",
    text: "",
    txt: "",
    plaintext: "",
    plain: "",
  };

  if (token === "diff") return "diff";
  const mapped = map[token] ?? token;
  return mapped || null;
}

function formatLanguageLabel(language: string): string {
  const normalized = language.trim().toLowerCase();
  const labels: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    json: "JSON",
    yaml: "YAML",
    bash: "Bash",
    shell: "Shell",
    sh: "Shell",
    zsh: "Zsh",
    jsx: "JSX",
    tsx: "TSX",
    markdown: "Markdown",
    diff: "Diff",
  };
  if (labels[normalized]) return labels[normalized];
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Text";
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
    return renderCodeBlock(trimmed, null);
  }

  return renderMarkdown(trimmed);
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

function inferDiffFilePathFromContext(source: string, blockStart: number): string | null {
  const contextStart = Math.max(0, blockStart - 2000);
  const context = source.slice(contextStart, blockStart);
  const lines = context.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines[i].trim();
    if (!candidate) continue;
    const match = candidate.match(/^file:\s+(.+)$/i);
    if (!match) continue;
    const filePath = String(match[1] ?? "").trim();
    return filePath || null;
  }
  return null;
}

function renderInlineDiff(diffText: string, filePath: string | null = null): string {
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
    let lineContent = line;
    if (line.startsWith("+")) {
      rowClass = "diff-add";
      lineContent = line.slice(1);
    } else if (line.startsWith("-")) {
      rowClass = "diff-delete";
      lineContent = line.slice(1);
    } else if (line.startsWith(" ")) {
      lineContent = line.slice(1);
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

    const renderedContent = lineContent
      ? highlightDiffLine(lineContent, filePath)
      : "&nbsp;";

    rows.push(
      `<tr class="diff-line ${rowClass}"><td class="line-no">${lineNo}</td><td class="line-content">${renderedContent}</td></tr>`
    );
  }

  return `<div class="chat-inline-diff diff-block"><table class="diff-table unified"><tbody>${rows.join("")}</tbody></table></div>`;
}

function highlightDiffLine(content: string, filePath: string | null): string {
  if (content.length > 8000) {
    return escapeHtml(content);
  }

  const prism = resolvePrism();
  if (!prism) {
    return fallbackDiffHighlight(content);
  }

  const language = filePath ? languageFromFilePath(filePath) : null;
  const grammar = language ? resolveGrammar(prism.languages, language) : null;

  if (!grammar || !language) {
    return fallbackDiffHighlight(content);
  }

  try {
    const highlighted = prism.highlight(content, grammar, language);
    return highlighted.includes("token") ? highlighted : fallbackDiffHighlight(content);
  } catch {
    return fallbackDiffHighlight(content);
  }
}

function languageFromFilePath(filePath: string): string | null {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "";

  const map: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    c: "c",
    h: "c",
    cc: "cpp",
    cxx: "cpp",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    py: "python",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    css: "css",
    sql: "sql",
    php: "php",
  };

  return map[ext] ?? null;
}

const FALLBACK_DIFF_KEYWORD_REGEX = /\b(import|from|export|default|class|interface|type|enum|public|private|protected|function|const|let|var|return|if|else|for|while|switch|case|break|continue|new|async|await|try|catch|finally|extends|implements|static|readonly|true|false|null|undefined|using|namespace|void|string|int|bool|this|base)\b/g;
const FALLBACK_DIFF_NUMBER_REGEX = /\b\d+(?:\.\d+)?\b/g;
const FALLBACK_DIFF_STRING_REGEX = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const FALLBACK_DIFF_COMMENT_REGEX = /\/\/.*$/g;

function fallbackDiffHighlight(content: string): string {
  let html = escapeHtml(content);
  const tokens: string[] = [];

  const stash = (value: string, className: string): string => {
    const index = tokens.push(`<span class="token ${className}">${value}</span>`) - 1;
    return `@@CHAT_DIFF_FALLBACK_${index}@@`;
  };

  html = html.replace(FALLBACK_DIFF_STRING_REGEX, (value) => stash(value, "string"));
  html = html.replace(FALLBACK_DIFF_COMMENT_REGEX, (value) => stash(value, "comment"));
  html = html.replace(FALLBACK_DIFF_KEYWORD_REGEX, '<span class="token keyword">$1</span>');
  html = html.replace(FALLBACK_DIFF_NUMBER_REGEX, '<span class="token number">$&</span>');

  return html.replace(/@@CHAT_DIFF_FALLBACK_(\d+)@@/g, (_match, index) => {
    return tokens[Number(index)] ?? "";
  });
}

type PrismLike = {
  languages: Record<string, Prism.Grammar>;
  highlight: (text: string, grammar: Prism.Grammar, language: string) => string;
};

function resolvePrism(): PrismLike | null {
  const globalPrism = (globalThis as any)?.Prism as Partial<PrismLike> | undefined;
  if (typeof globalPrism?.highlight === "function" && globalPrism.languages) {
    return globalPrism as PrismLike;
  }

  const imported = Prism as unknown as Partial<PrismLike> | undefined;
  if (typeof imported?.highlight === "function" && imported.languages) {
    return imported as PrismLike;
  }

  return null;
}

function resolveGrammar(
  languages: Record<string, Prism.Grammar>,
  language: string
): Prism.Grammar | null {
  if (languages[language]) return languages[language];

  if (language === "csharp") {
    return languages.cs ?? languages.dotnet ?? null;
  }

  if (language === "typescript") {
    return languages.ts ?? null;
  }

  if (language === "javascript") {
    return languages.js ?? null;
  }

  if (language === "yaml") {
    return languages.yml ?? null;
  }

  return null;
}

function shouldExpandTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "write"
    || normalized === "edit"
    || normalized === "multiedit"
    || normalized === "remove"
    || normalized === "delete"
    || normalized === "todowrite";
}
