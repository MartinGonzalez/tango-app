import { h, clearChildren } from "../lib/dom.ts";
import type { SessionInfo } from "../../shared/types.ts";

const ACTIVITY_DOTS: Record<string, { char: string; cls: string }> = {
  working: { char: "\u25CF", cls: "dot-working" },
  waiting: { char: "\u25D0", cls: "dot-waiting" },
  waiting_for_input: { char: "\u25D0", cls: "dot-waiting-input" },
  idle: { char: "\u25CB", cls: "dot-idle" },
  finished: { char: "\u25CB", cls: "dot-finished" },
};

export type WorkspaceData = {
  path: string;
  name: string;
  branch: string | null;
  active: boolean;
  sessions: SessionInfo[];
  expanded: boolean;
};

export type SidebarCallbacks = {
  onSelectSession: (sessionId: string, workspacePath: string) => void;
  onNewSession: (workspacePath: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onDeleteSession: (sessionId: string, workspacePath: string) => void;
  onToggleWorkspace: (path: string) => void;
  onRenameSession: (sessionId: string, newName: string) => void;
};

export class Sidebar {
  #el: HTMLElement;
  #listEl: HTMLElement;
  #callbacks: SidebarCallbacks;
  #activeSessionId: string | null = null;
  #openMenuSessionId: string | null = null;
  #renamingSessionId: string | null = null;
  #removeWorkspaceConfirmOpen = false;

  constructor(container: HTMLElement, callbacks: SidebarCallbacks) {
    this.#callbacks = callbacks;

    const header = h("div", { class: "ws-header" }, [
      h("span", { class: "ws-header-title" }, ["Workspaces"]),
      h("button", {
        class: "ws-add-btn",
        onclick: () => callbacks.onAddWorkspace(),
        title: "Add workspace",
      }, ["+"]),
    ]);

    this.#listEl = h("div", { class: "ws-list" });

    this.#el = h("div", { class: "sidebar" }, [
      header,
      this.#listEl,
    ]);

    container.appendChild(this.#el);
  }

  setActiveSession(sessionId: string | null): void {
    this.#activeSessionId = sessionId;
    for (const item of this.#el.querySelectorAll(".ws-session-item")) {
      (item as HTMLElement).classList.toggle(
        "active",
        (item as HTMLElement).dataset.sessionId === sessionId
      );
    }
  }

  render(workspaces: WorkspaceData[]): void {
    // Don't re-render if a rename or menu is open (preserves UI state)
    if (this.#renamingSessionId || this.#openMenuSessionId) return;

    clearChildren(this.#listEl);

    if (workspaces.length === 0) {
      this.#listEl.appendChild(
        h("div", { class: "ws-empty" }, [
          h("div", { class: "ws-empty-text" }, ["No workspaces"]),
          h("button", {
            class: "ws-empty-btn",
            onclick: () => this.#callbacks.onAddWorkspace(),
          }, ["Open Workspace"]),
        ])
      );
      return;
    }

    for (const ws of workspaces) {
      this.#listEl.appendChild(this.#renderWorkspace(ws));
    }
  }

  #renderWorkspace(ws: WorkspaceData): HTMLElement {
    const chevron = ws.expanded ? "\u25BC" : "\u25B6";
    const activeCount = ws.sessions.filter(
      (s) => s.activity === "working" || s.activity === "waiting_for_input"
    ).length;
    const activeBadge = activeCount > 0
      ? h("span", { class: "ws-active-badge" }, [String(activeCount)])
      : null;

    const folderHeader = h(
      "div",
      {
        class: "ws-folder-header",
        onclick: () => this.#callbacks.onToggleWorkspace(ws.path),
      },
      [
        h("span", { class: "ws-chevron" }, [chevron]),
        h("div", { class: "ws-folder-meta" }, [
          h("span", { class: "ws-folder-name" }, [ws.name]),
          h("span", { class: "ws-folder-branch" }, [ws.branch ?? "No branch"]),
        ]),
        ...(activeBadge ? [activeBadge] : []),
      ]
    );

    const actions = h("div", { class: "ws-folder-actions" }, [
      h("button", {
        class: "ws-action-btn",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.#callbacks.onNewSession(ws.path);
        },
        title: "New session",
      }, ["+"]),
      h("button", {
        class: "ws-action-btn ws-action-remove",
        onclick: async (e: Event) => {
          e.stopPropagation();
          const confirmed = await this.#confirmWorkspaceRemoval(ws.name);
          if (!confirmed) return;
          this.#callbacks.onRemoveWorkspace(ws.path);
        },
        title: "Remove workspace",
      }, ["\u00D7"]),
    ]);

    const headerRow = h("div", { class: "ws-folder-row" }, [
      folderHeader,
      actions,
    ]);

    const folder = h("div", {
      class: `ws-folder${ws.expanded ? " expanded" : ""}${ws.active ? " active" : ""}`,
      dataset: { wsPath: ws.path },
    }, [headerRow]);

    if (ws.expanded) {
      const sessionsList = h("div", { class: "ws-sessions" });

      if (ws.sessions.length === 0) {
        sessionsList.appendChild(
          h("div", { class: "ws-no-sessions" }, ["No sessions"])
        );
      } else {
        for (const session of ws.sessions) {
          sessionsList.appendChild(this.#renderSession(session, ws.path));
        }
      }

      folder.appendChild(sessionsList);
    }

    return folder;
  }

  #renderSession(session: SessionInfo, workspacePath: string): HTMLElement {
    const dot = ACTIVITY_DOTS[session.activity] ?? ACTIVITY_DOTS.idle;
    const label = formatSessionLabel(session.topic, session.prompt);
    const isActive = session.sessionId === this.#activeSessionId;
    const isHistorical = session.activity === "finished" && !session.isAppSpawned;

    // Show time ago for historical, activity label for live
    const subtitle = isHistorical
      ? timeAgo(session.updatedAt || session.startedAt)
      : session.activity.replace(/_/g, " ");

    const sessionItem = h(
      "div",
      {
        class: `ws-session-item${isActive ? " active" : ""}${isHistorical ? " historical" : ""}`,
        dataset: { sessionId: session.sessionId },
        onclick: (e: Event) => {
          // Don't select if clicking on menu or menu button
          if ((e.target as HTMLElement).closest(".ws-session-menu-btn, .ws-session-menu")) {
            return;
          }
          this.#callbacks.onSelectSession(session.sessionId, workspacePath);
        },
      },
      [
        h("span", { class: `ws-session-dot ${dot.cls}` }, [dot.char]),
        h("div", { class: "ws-session-info" }, [
          h("span", { class: "ws-session-label" }, [label]),
          h("span", { class: "ws-session-activity" }, [subtitle]),
        ]),
        h("button", {
          class: "ws-session-menu-btn",
          onclick: (e: Event) => {
            e.stopPropagation();
            this.#toggleSessionMenu(session.sessionId, sessionItem, workspacePath);
          },
          title: "Session options",
        }, ["\u22EE"]), // vertical ellipsis
      ]
    );

    return sessionItem;
  }

  #toggleSessionMenu(sessionId: string, sessionItem: HTMLElement, workspacePath: string): void {
    // Close any open menu
    const existingMenu = this.#el.querySelector(".ws-session-menu");
    if (existingMenu) {
      existingMenu.remove();
      if (this.#openMenuSessionId === sessionId) {
        this.#openMenuSessionId = null;
        return;
      }
    }

    this.#openMenuSessionId = sessionId;

    const menu = h("div", { class: "ws-session-menu" }, [
      h("button", {
        class: "ws-session-menu-item",
        onclick: () => {
          this.#showRenameDialog(sessionId);
          menu.remove();
          this.#openMenuSessionId = null;
        },
      }, ["Rename"]),
      h("button", {
        class: "ws-session-menu-item ws-session-menu-item-danger",
        onclick: () => {
          this.#callbacks.onDeleteSession(sessionId, workspacePath);
          menu.remove();
          this.#openMenuSessionId = null;
        },
      }, ["Delete"]),
    ]);

    sessionItem.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        this.#openMenuSessionId = null;
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  #showRenameDialog(sessionId: string): void {
    const sessionEl = this.#el.querySelector(`[data-session-id="${sessionId}"]`);
    if (!sessionEl) return;

    const labelEl = sessionEl.querySelector(".ws-session-label");
    if (!labelEl) return;

    const currentName = labelEl.textContent ?? "";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ws-session-rename-input";
    input.value = currentName;
    input.placeholder = "Session name";

    this.#renamingSessionId = sessionId;

    const save = () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        this.#callbacks.onRenameSession(sessionId, newName);
        labelEl.textContent = newName;
      } else {
        labelEl.textContent = currentName;
      }
      labelEl.style.display = "";
      input.remove();
      this.#renamingSessionId = null;
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        save();
      } else if (e.key === "Escape") {
        labelEl.textContent = currentName;
        labelEl.style.display = "";
        input.remove();
        this.#renamingSessionId = null;
      }
    });

    labelEl.style.display = "none";
    labelEl.parentElement?.insertBefore(input, labelEl);
    input.focus();
    input.select();
  }

  get element(): HTMLElement {
    return this.#el;
  }

  async #confirmWorkspaceRemoval(workspaceName: string): Promise<boolean> {
    if (this.#removeWorkspaceConfirmOpen) return false;
    this.#removeWorkspaceConfirmOpen = true;

    return await new Promise<boolean>((resolve) => {
      const titleId = "ws-remove-confirm-title";
      const overlay = h("div", { class: "ws-confirm-overlay" });
      const cancelBtn = h("button", {
        class: "ws-confirm-btn",
        type: "button",
      }, ["Cancel"]) as HTMLButtonElement;
      const removeBtn = h("button", {
        class: "ws-confirm-btn ws-confirm-btn-danger",
        type: "button",
      }, ["Remove"]) as HTMLButtonElement;

      const dialog = h("div", {
        class: "ws-confirm-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
      }, [
        h("div", { class: "ws-confirm-title", id: titleId }, ["Remove workspace"]),
        h("div", { class: "ws-confirm-text" }, [
          `Remove "${workspaceName}" from the workspace list?`,
        ]),
        h("div", { class: "ws-confirm-actions" }, [cancelBtn, removeBtn]),
      ]);

      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        document.removeEventListener("keydown", onKeyDown, true);
        this.#removeWorkspaceConfirmOpen = false;
        resolve(result);
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
      };

      cancelBtn.addEventListener("click", () => finish(false));
      removeBtn.addEventListener("click", () => finish(true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          finish(false);
        }
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKeyDown, true);
      cancelBtn.focus();
    });
  }
}

function formatSessionLabel(topic: string | null, prompt: string | null): string {
  const preferred = collapseWhitespace(topic ?? "");
  if (preferred) {
    return simplifyLabel(preferred);
  }

  const fromPrompt = extractPromptLabel(prompt ?? "");
  if (fromPrompt) {
    return simplifyLabel(fromPrompt);
  }

  return "Claude session";
}

function simplifyLabel(text: string): string {
  const cleaned = collapseWhitespace(text);
  if (!cleaned) return "Claude session";
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

function extractPromptLabel(prompt: string): string {
  const command = extractCommandName(prompt);
  if (command) return command;

  const withoutDecorators = prompt
    .replace(/<attached_files>\s*[\s\S]*?<\/attached_files>/gi, "\n")
    .replace(/<command-message>\s*[\s\S]*?<\/command-message>/gi, "\n")
    .replace(/<command-name>\s*[\s\S]*?<\/command-name>/gi, "\n");

  for (const rawLine of withoutDecorators.split("\n")) {
    const line = collapseWhitespace(rawLine);
    if (line) return line;
  }
  return "";
}

function extractCommandName(prompt: string): string | null {
  const commandNameMatch = prompt.match(
    /<command-name>\s*([^<\n]+?)\s*<\/command-name>/i
  );
  if (commandNameMatch?.[1]) {
    return normalizeCommandName(commandNameMatch[1]);
  }

  const commandMessageMatch = prompt.match(
    /<command-message>\s*([\s\S]*?)\s*<\/command-message>/i
  );
  if (commandMessageMatch?.[1]) {
    return normalizeCommandName(commandMessageMatch[1]);
  }

  return null;
}

function normalizeCommandName(value: string): string | null {
  const normalized = collapseWhitespace(value);
  if (!normalized) return null;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function collapseWhitespace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "finished";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
