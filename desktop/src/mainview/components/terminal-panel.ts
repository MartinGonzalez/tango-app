import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";

type RPC = {
  request: {
    ptySpawn(p: { id: string; cwd: string; cols?: number; rows?: number; sessionId?: string; newSessionId?: string }): Promise<void>;
    ptyInput(p: { id: string; data: string }): Promise<void>;
    ptyResize(p: { id: string; cols: number; rows: number }): Promise<void>;
    ptyKill(p: { id: string }): Promise<void>;
  };
};

export type TerminalPanelCallbacks = {
  onOpenInFinder?: (path: string) => void;
};

let nextPtyId = 0;
function makePtyId(): string {
  return `pty-${++nextPtyId}-${Date.now()}`;
}

/** Max buffer size per PTY (2 MB). Oldest chunks are dropped when exceeded. */
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

export class TerminalPanel {
  readonly element: HTMLElement;

  #headerEl: HTMLElement;
  #titleEl: HTMLElement;
  #stageEl: HTMLElement;
  #sessionIdEl: HTMLElement;
  #separatorEl: HTMLElement;
  #bottomRowEl: HTMLElement;
  #menuEl: HTMLElement;
  #menuBtnEl: HTMLButtonElement;
  #openInFinderBtn: HTMLButtonElement;

  #container: HTMLElement;
  #term: Terminal;
  #fitAddon: FitAddon;
  #rpc: RPC;
  #callbacks: TerminalPanelCallbacks;
  #stagePath: string | null = null;

  #activePtyId: string | null = null;
  #resizeObserver: ResizeObserver;
  #mounted = false;

  /** sessionId → ptyId — tracks which session owns which PTY */
  #sessionPtyMap = new Map<string, string>();
  /** ptyId → buffered output chunks (replayed when switching back) */
  #ptyBuffers = new Map<string, Uint8Array[]>();
  /** ptyId → total buffer size in bytes */
  #ptyBufferSizes = new Map<string, number>();

  constructor(rpc: RPC, callbacks: TerminalPanelCallbacks = {}) {
    this.#rpc = rpc;
    this.#callbacks = callbacks;

    // ── Header ──
    this.#titleEl = document.createElement("span");
    this.#titleEl.className = "chat-header-title";
    this.#titleEl.textContent = "Terminal";

    this.#stageEl = document.createElement("span");
    this.#stageEl.className = "chat-header-stage";
    this.#stageEl.hidden = true;

    this.#separatorEl = document.createElement("span");
    this.#separatorEl.className = "terminal-header-separator";
    this.#separatorEl.textContent = "·";
    this.#separatorEl.hidden = true;

    this.#sessionIdEl = document.createElement("span");
    this.#sessionIdEl.className = "terminal-header-session-id";
    this.#sessionIdEl.hidden = true;

    this.#bottomRowEl = document.createElement("div");
    this.#bottomRowEl.className = "terminal-header-bottom-row";
    this.#bottomRowEl.hidden = true;
    this.#bottomRowEl.append(this.#stageEl, this.#separatorEl, this.#sessionIdEl);

    const topRow = document.createElement("div");
    topRow.className = "terminal-header-top-row";
    topRow.append(this.#titleEl);

    // ── 3-dot menu ──
    this.#openInFinderBtn = document.createElement("button");
    this.#openInFinderBtn.type = "button";
    this.#openInFinderBtn.className = "terminal-header-menu-item";
    this.#openInFinderBtn.textContent = "Open in Finder";
    this.#openInFinderBtn.disabled = true;
    this.#openInFinderBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const path = this.#stagePath;
      if (!path) return;
      this.#callbacks.onOpenInFinder?.(path);
      this.#setMenuOpen(false);
    });

    const menuIcon = document.createElement("span");
    menuIcon.className = "material-symbols-outlined";
    menuIcon.setAttribute("aria-hidden", "true");
    menuIcon.textContent = "more_vert";

    this.#menuBtnEl = document.createElement("button");
    this.#menuBtnEl.type = "button";
    this.#menuBtnEl.className = "terminal-header-menu-btn";
    this.#menuBtnEl.title = "More";
    this.#menuBtnEl.setAttribute("aria-label", "More");
    this.#menuBtnEl.setAttribute("aria-haspopup", "menu");
    this.#menuBtnEl.setAttribute("aria-expanded", "false");
    this.#menuBtnEl.append(menuIcon);
    this.#menuBtnEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = this.#menuEl.classList.contains("open");
      this.#setMenuOpen(!isOpen);
    });

    const popover = document.createElement("div");
    popover.className = "terminal-header-menu-popover";
    popover.append(this.#openInFinderBtn);

    this.#menuEl = document.createElement("div");
    this.#menuEl.className = "terminal-header-menu";
    this.#menuEl.append(this.#menuBtnEl, popover);

    const meta = document.createElement("div");
    meta.className = "terminal-header-meta";
    meta.append(topRow, this.#bottomRowEl);

    this.#headerEl = document.createElement("div");
    this.#headerEl.className = "chat-header";
    this.#headerEl.append(meta, this.#menuEl);

    // Close menu on outside click
    document.addEventListener("pointerdown", (e) => {
      if (this.#menuEl.classList.contains("open") && !this.#menuEl.contains(e.target as Node)) {
        this.#setMenuOpen(false);
      }
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.#setMenuOpen(false);
    });

    // ── Terminal container (no padding — FitAddon needs exact dimensions) ──
    this.#container = document.createElement("div");
    this.#container.className = "terminal-container";

    // ── Root element ──
    this.element = document.createElement("div");
    this.element.className = "terminal-panel";
    this.element.append(this.#headerEl, this.#container);

    // ── xterm.js ──
    this.#term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1a1a1a",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    this.#fitAddon = new FitAddon();
    this.#term.loadAddon(this.#fitAddon);

    // Grapheme-aware unicode — handles emoji, combining chars that Claude's TUI uses
    const graphemes = new UnicodeGraphemesAddon();
    this.#term.loadAddon(graphemes);
    this.#term.unicode.activeVersion = "15";

    // Forward keystrokes → backend PTY
    this.#term.onData((data) => {
      if (this.#activePtyId) {
        this.#rpc.request.ptyInput({ id: this.#activePtyId, data });
      }
    });

    // Forward resize → all live PTYs (keeps background PTYs in sync)
    this.#term.onResize(({ cols, rows }) => {
      for (const ptyId of this.#ptyBuffers.keys()) {
        this.#rpc.request.ptyResize({ id: ptyId, cols, rows });
      }
    });

    // Auto-fit when container resizes (debounced to avoid rapid resize storms)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#mounted) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          this.#fitAddon.fit();
          this.#term.scrollToBottom();
        } catch { /* ignore during transitions */ }
      }, 50);
    });
  }

  /** Open xterm in the container. Call once when the element is in the DOM. */
  mount(): void {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#term.open(this.#container);
    this.#resizeObserver.observe(this.#container);

    // Try WebGL renderer for better performance with rapid TUI updates
    try {
      this.#term.loadAddon(new WebglAddon());
    } catch {
      // Falls back to DOM renderer — that's fine
    }

    // Fit after a frame so the layout is fully computed
    requestAnimationFrame(() => {
      try { this.#fitAddon.fit(); } catch { /* ignore */ }
    });
  }

  unmount(): void {
    this.#mounted = false;
    this.#resizeObserver.disconnect();
  }

  /** Spawn `claude --resume <sessionId>` in a PTY at the given cwd.
   *  If the session already has a live PTY, switch to it instead of spawning. */
  async spawnSession(sessionId: string, cwd: string): Promise<void> {
    const existingPtyId = this.#sessionPtyMap.get(sessionId);
    if (existingPtyId && this.#ptyBuffers.has(existingPtyId)) {
      this.#switchTo(existingPtyId);
      return;
    }
    // New session — spawn without killing others
    await this.#fitAndWait();
    const id = makePtyId();
    this.#sessionPtyMap.set(sessionId, id);
    this.#ptyBuffers.set(id, []);
    this.#ptyBufferSizes.set(id, 0);
    this.#activePtyId = id;
    this.#term.reset();
    const { cols, rows } = this.#term;
    console.log(`[pty] spawn session cols=${cols} rows=${rows}`);
    await this.#rpc.request.ptySpawn({ id, cwd, cols, rows, sessionId });
  }

  /** Spawn a new Claude session with a pre-assigned ID at the given cwd.
   *  Returns the session ID so callers can track it immediately. */
  async spawnNewSession(cwd: string): Promise<string> {
    await this.#fitAndWait();
    const id = makePtyId();
    const newSessionId = crypto.randomUUID();
    this.#sessionPtyMap.set(newSessionId, id);
    this.#ptyBuffers.set(id, []);
    this.#ptyBufferSizes.set(id, 0);
    this.#activePtyId = id;
    this.#term.reset();
    const { cols, rows } = this.#term;
    console.log(`[pty] spawn new session=${newSessionId} cols=${cols} rows=${rows}`);
    await this.#rpc.request.ptySpawn({ id, cwd, cols, rows, newSessionId });
    return newSessionId;
  }

  /** Called by RPC message handler when PTY sends base64-encoded data. */
  writePtyData(id: string, b64: string): void {
    // Decode base64 → raw bytes
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Always buffer (for replay on switch-back)
    this.#bufferChunk(id, bytes);

    // Only render if this is the active PTY
    if (this.#activePtyId === id) {
      this.#term.write(bytes);
    }
  }

  /** Called by RPC message handler when PTY exits. */
  onPtyExit(id: string, _exitCode: number): void {
    // Remove session mapping
    for (const [sid, pid] of this.#sessionPtyMap) {
      if (pid === id) { this.#sessionPtyMap.delete(sid); break; }
    }
    this.#ptyBuffers.delete(id);
    this.#ptyBufferSizes.delete(id);

    if (this.#activePtyId === id) {
      this.#term.writeln("\r\n\x1b[90m— process exited —\x1b[0m");
      this.#activePtyId = null;
    }
  }

  setHeader(title: string, stagePath: string | null, sessionId: string | null = null): void {
    this.#titleEl.textContent = title || "Terminal";
    this.#stagePath = stagePath;

    const hasStage = Boolean(stagePath);
    const hasSessionId = Boolean(sessionId);

    if (hasStage) {
      this.#stageEl.textContent = stagePath!;
      this.#stageEl.title = stagePath!;
      this.#stageEl.hidden = false;
      this.#openInFinderBtn.disabled = false;
    } else {
      this.#stageEl.textContent = "";
      this.#stageEl.hidden = true;
      this.#openInFinderBtn.disabled = true;
      this.#setMenuOpen(false);
    }

    if (hasSessionId) {
      this.#sessionIdEl.textContent = sessionId!;
      this.#sessionIdEl.hidden = false;
    } else {
      this.#sessionIdEl.textContent = "";
      this.#sessionIdEl.hidden = true;
    }

    this.#separatorEl.hidden = !(hasStage && hasSessionId);
    this.#bottomRowEl.hidden = !(hasStage || hasSessionId);
  }

  #setMenuOpen(open: boolean): void {
    this.#menuEl.classList.toggle("open", open);
    this.#menuBtnEl.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /** Kill only the active PTY and clear the terminal display. */
  clear(): void {
    this.#term.reset();
    if (this.#activePtyId) {
      const id = this.#activePtyId;
      this.#activePtyId = null;
      this.#ptyBuffers.delete(id);
      this.#ptyBufferSizes.delete(id);
      for (const [sid, pid] of this.#sessionPtyMap) {
        if (pid === id) { this.#sessionPtyMap.delete(sid); break; }
      }
      void this.#rpc.request.ptyKill({ id }).catch(() => {});
    }
  }

  /** Kill the PTY associated with a specific session (used when deleting a session). */
  killSession(sessionId: string): void {
    const ptyId = this.#sessionPtyMap.get(sessionId);
    if (!ptyId) return;

    this.#sessionPtyMap.delete(sessionId);
    this.#ptyBuffers.delete(ptyId);
    this.#ptyBufferSizes.delete(ptyId);

    if (this.#activePtyId === ptyId) {
      this.#term.reset();
      this.#activePtyId = null;
    }

    void this.#rpc.request.ptyKill({ id: ptyId }).catch(() => {});
  }

  focus(): void {
    this.#term.focus();
  }

  /** Reset xterm and replay the buffered output for a PTY. */
  #switchTo(ptyId: string): void {
    this.#activePtyId = ptyId;
    this.#term.reset();
    const chunks = this.#ptyBuffers.get(ptyId);
    if (chunks) {
      for (const chunk of chunks) this.#term.write(chunk);
    }
    // xterm writes are async internally — scroll to bottom after they flush
    requestAnimationFrame(() => this.#term.scrollToBottom());
  }

  /** Buffer a chunk for a PTY, enforcing the 2 MB cap. */
  #bufferChunk(ptyId: string, bytes: Uint8Array): void {
    const chunks = this.#ptyBuffers.get(ptyId);
    if (!chunks) return;

    chunks.push(bytes);
    const currentSize = (this.#ptyBufferSizes.get(ptyId) ?? 0) + bytes.length;
    this.#ptyBufferSizes.set(ptyId, currentSize);

    // Evict oldest chunks if over budget
    let size = currentSize;
    while (size > MAX_BUFFER_BYTES && chunks.length > 0) {
      const dropped = chunks.shift()!;
      size -= dropped.length;
    }
    this.#ptyBufferSizes.set(ptyId, size);
  }

  /** Fit and wait a frame to ensure layout is settled before reading cols/rows. */
  #fitAndWait(): Promise<void> {
    if (!this.#mounted) return Promise.resolve();
    return new Promise((resolve) => {
      try { this.#fitAddon.fit(); } catch { /* ignore */ }
      requestAnimationFrame(() => {
        try { this.#fitAddon.fit(); } catch { /* ignore */ }
        resolve();
      });
    });
  }
}
