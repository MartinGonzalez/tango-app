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
  onOpenWith?: (path: string, app?: string) => void;
  onGetAvailableApps?: () => Promise<Array<{ id: string; name: string; appName: string }>>;
  onGetPreferredApp?: () => Promise<string | null>;
  onSetPreferredApp?: (app: string | null) => void;
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
  #openSplitEl: HTMLElement;
  #openMainBtn: HTMLButtonElement;
  #openArrowBtn: HTMLButtonElement;
  #openDropdownEl: HTMLElement;
  #preferredApp: string | null = null;
  #preferredAppId: string | null = null;
  #cachedApps: Array<{ id: string; name: string; appName: string; icon?: string }> = [];

  #container: HTMLElement;
  #term: Terminal;
  #fitAddon: FitAddon;
  #webglAddon: WebglAddon | null = null;
  #rpc: RPC;
  #callbacks: TerminalPanelCallbacks;
  #stagePath: string | null = null;

  #activePtyId: string | null = null;
  #resizeObserver: ResizeObserver;
  #mounted = false;
  #wasHidden = false;
  /** True when the user has manually scrolled up from the bottom. */
  #userScrolledUp = false;
  /** Cached reference to xterm's .xterm-viewport element for direct DOM scroll sync. */
  #viewportEl: HTMLElement | null = null;
  /** Animation frame ID for the scroll guard loop. */
  #scrollGuardRaf = 0;

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

    // ── Split Open button ──
    const openIcon = document.createElement("span");
    openIcon.className = "material-symbols-outlined open-split-icon";
    openIcon.setAttribute("aria-hidden", "true");
    openIcon.textContent = "folder_open";

    const openLabel = document.createElement("span");
    openLabel.textContent = "Open";

    this.#openMainBtn = document.createElement("button");
    this.#openMainBtn.type = "button";
    this.#openMainBtn.className = "open-split-main";
    this.#openMainBtn.title = "Open in Finder";
    this.#openMainBtn.disabled = true;
    this.#openMainBtn.append(openIcon, openLabel);
    this.#openMainBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const path = this.#stagePath;
      if (!path) return;
      this.#callbacks.onOpenWith?.(path, this.#preferredApp ?? undefined);
    });

    const caret = document.createElement("span");
    caret.className = "open-split-caret";
    caret.textContent = "\u25BE";

    this.#openArrowBtn = document.createElement("button");
    this.#openArrowBtn.type = "button";
    this.#openArrowBtn.className = "open-split-arrow";
    this.#openArrowBtn.title = "Choose app";
    this.#openArrowBtn.disabled = true;
    this.#openArrowBtn.setAttribute("aria-haspopup", "menu");
    this.#openArrowBtn.setAttribute("aria-expanded", "false");
    this.#openArrowBtn.append(caret);
    this.#openArrowBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = this.#openSplitEl.classList.contains("open");
      this.#setMenuOpen(!isOpen);
      if (!isOpen) this.#populateAppDropdown();
    });

    this.#openDropdownEl = document.createElement("div");
    this.#openDropdownEl.className = "open-split-dropdown";

    this.#openSplitEl = document.createElement("div");
    this.#openSplitEl.className = "open-split-btn";
    this.#openSplitEl.append(this.#openMainBtn, this.#openArrowBtn, this.#openDropdownEl);

    const meta = document.createElement("div");
    meta.className = "terminal-header-meta";
    meta.append(topRow, this.#bottomRowEl);

    this.#headerEl = document.createElement("div");
    this.#headerEl.className = "chat-header";
    this.#headerEl.append(meta, this.#openSplitEl);

    // Close menu on outside click
    document.addEventListener("pointerdown", (e) => {
      if (this.#openSplitEl.classList.contains("open") && !this.#openSplitEl.contains(e.target as Node)) {
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

    // Track whether user has manually scrolled away from the bottom.
    // We use wheel events (definitively user-initiated) instead of xterm's
    // onScroll, which also fires during programmatic scrolling (fit reflow,
    // scrollToBottom, write auto-scroll) and creates race conditions.
    this.#container.addEventListener("wheel", () => {
      // Check after xterm processes the wheel event
      requestAnimationFrame(() => {
        const buf = this.#term.buffer.active;
        this.#userScrolledUp = buf.viewportY < buf.baseY;
      });
    }, { passive: true });

    // Auto-fit when container resizes (debounced to avoid rapid resize storms).
    // Skip fit() when the container is hidden (0 dimensions).
    // When the panel comes back from hidden, re-create the WebGL addon to fix
    // stale viewport cache (xterm's internal state stays correct but the WebGL
    // renderer desyncs when the canvas goes to 0x0).
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    this.#resizeObserver = new ResizeObserver((entries) => {
      if (!this.#mounted) return;
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) {
        this.#wasHidden = true;
        return;
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try { this.#fitAddon.fit(); } catch { /* ignore during transitions */ }
        if (this.#wasHidden) {
          this.#wasHidden = false;
          this.#recreateWebgl();
        }
        // The scroll guard loop (requestAnimationFrame) will fix any
        // DOM scrollTop desync caused by fit() or DOM re-insertion.
        // No manual scroll correction needed here.
      }, 50);
    });
  }

  /** Open xterm in the container. Call once when the element is in the DOM. */
  mount(): void {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#term.open(this.#container);
    this.#viewportEl = this.#container.querySelector(".xterm-viewport") as HTMLElement | null;
    this.#resizeObserver.observe(this.#container);

    // Try WebGL renderer for better performance with rapid TUI updates
    this.#recreateWebgl();

    // Fit after a frame so the layout is fully computed
    requestAnimationFrame(() => {
      try { this.#fitAddon.fit(); } catch { /* ignore */ }
    });

    // Scroll guard: detects and corrects DOM scrollTop desync.
    // xterm's internal ydisp can be correct while the browser resets
    // .xterm-viewport.scrollTop to 0 (e.g. after fit() reflow, CSS
    // transitions, or DOM re-insertion). When that happens,
    // scrollToBottom() is a no-op because xterm thinks it's already
    // at the bottom — but the DOM shows the top. This loop directly
    // syncs the DOM scrollTop with xterm's state every frame.
    const guardScroll = () => {
      if (!this.#mounted) return;
      if (!this.#userScrolledUp && this.#viewportEl && this.#activePtyId) {
        const vp = this.#viewportEl;
        const maxScroll = vp.scrollHeight - vp.clientHeight;
        // If the DOM is more than a few pixels off from the bottom, fix it
        if (maxScroll > 0 && vp.scrollTop < maxScroll - 5) {
          vp.scrollTop = maxScroll;
        }
      }
      this.#scrollGuardRaf = requestAnimationFrame(guardScroll);
    };
    this.#scrollGuardRaf = requestAnimationFrame(guardScroll);
  }

  unmount(): void {
    this.#mounted = false;
    this.#resizeObserver.disconnect();
    cancelAnimationFrame(this.#scrollGuardRaf);
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
    this.#userScrolledUp = false;
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
    this.#userScrolledUp = false;
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
      this.#openMainBtn.disabled = false;
      this.#openArrowBtn.disabled = false;
    } else {
      this.#stageEl.textContent = "";
      this.#stageEl.hidden = true;
      this.#openMainBtn.disabled = true;
      this.#openArrowBtn.disabled = true;
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
    this.#openSplitEl.classList.toggle("open", open);
    this.#openArrowBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  async initPreferences(): Promise<void> {
    const [preferredApp, apps] = await Promise.all([
      this.#callbacks.onGetPreferredApp?.() ?? null,
      this.#callbacks.onGetAvailableApps?.() ?? [],
    ]);
    this.#preferredApp = preferredApp;
    this.#cachedApps = apps;
    if (preferredApp) {
      const match = apps.find((a) => a.appName === preferredApp);
      if (match) this.#preferredAppId = match.id;
    }
    this.#updateOpenButtonIcon();
  }

  async #populateAppDropdown(): Promise<void> {
    this.#openDropdownEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "open-dropdown-header";
    header.textContent = "Open in";
    this.#openDropdownEl.append(header);

    const apps = await this.#callbacks.onGetAvailableApps?.() ?? [];
    this.#cachedApps = apps;

    for (const app of apps) {
      const isSelected = (app.appName === this.#preferredApp) || (app.id === "finder" && !this.#preferredApp);

      const iconEl = this.#makeAppIconEl(app);

      const name = document.createElement("span");
      name.className = "open-app-name";
      name.textContent = app.name;

      const item = document.createElement("button");
      item.type = "button";
      item.className = `open-app-item${isSelected ? " selected" : ""}`;
      item.append(iconEl, name);
      item.addEventListener("click", () => {
        const appValue = app.id === "finder" ? null : app.appName;
        this.#preferredApp = appValue;
        this.#preferredAppId = app.id === "finder" ? null : app.id;
        this.#callbacks.onSetPreferredApp?.(appValue);
        this.#updateOpenButtonIcon();
        this.#setMenuOpen(false);
        const path = this.#stagePath;
        if (path) this.#callbacks.onOpenWith?.(path, appValue ?? undefined);
      });

      this.#openDropdownEl.append(item);
    }
  }

  #makeAppIconEl(app: { id: string; icon?: string }): HTMLElement {
    if (app.icon) {
      const img = document.createElement("img");
      img.className = "open-app-icon";
      img.src = app.icon;
      img.setAttribute("aria-hidden", "true");
      return img;
    }
    const fallback: Record<string, string> = {
      finder: "folder_open", cursor: "edit_square", vscode: "code",
      terminal: "terminal", iterm2: "terminal", ghostty: "terminal",
      warp: "terminal", xcode: "build", "android-studio": "phone_android", rider: "code",
    };
    const span = document.createElement("span");
    span.className = "material-symbols-outlined open-app-icon";
    span.setAttribute("aria-hidden", "true");
    span.textContent = fallback[app.id] ?? "open_in_new";
    return span;
  }

  #updateOpenButtonIcon(): void {
    const appLabel = this.#preferredApp ?? "Finder";
    this.#openMainBtn.title = `Open in ${appLabel}`;
    const oldIcon = this.#openMainBtn.querySelector(".open-split-icon");
    if (!oldIcon) return;

    const appId = this.#preferredAppId ?? "finder";
    const app = this.#cachedApps.find((a) => a.id === appId);

    if (app?.icon) {
      const img = document.createElement("img");
      img.className = "open-split-icon";
      img.src = app.icon;
      img.setAttribute("aria-hidden", "true");
      oldIcon.replaceWith(img);
    } else {
      const fallback: Record<string, string> = {
        finder: "folder_open", cursor: "edit_square", vscode: "code",
        terminal: "terminal", iterm2: "terminal", ghostty: "terminal",
        warp: "terminal", xcode: "build", "android-studio": "phone_android", rider: "code",
      };
      if (oldIcon.tagName === "IMG") {
        const span = document.createElement("span");
        span.className = "material-symbols-outlined open-split-icon";
        span.setAttribute("aria-hidden", "true");
        span.textContent = fallback[appId] ?? "open_in_new";
        oldIcon.replaceWith(span);
      } else {
        oldIcon.textContent = fallback[appId] ?? "open_in_new";
      }
    }
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

  #recreateWebgl(): void {
    try { this.#webglAddon?.dispose(); } catch { /* ignore */ }
    this.#webglAddon = null;
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
        this.#webglAddon = null;
      });
      this.#term.loadAddon(addon);
      this.#webglAddon = addon;
    } catch {
      // Falls back to DOM renderer
    }
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
    this.#userScrolledUp = false;
    requestAnimationFrame(() => {
      this.#term.scrollToBottom();
      this.#userScrolledUp = false;
    });
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
