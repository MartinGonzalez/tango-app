import { h } from "../lib/dom.ts";
import type {
  CommitActionMode,
  CommitContext,
  CommitExecutionResult,
} from "../../shared/types.ts";

type CommitModalOpenOptions = {
  context: CommitContext;
  onGenerate: (includeUnstaged: boolean) => Promise<string>;
  onSubmit: (payload: {
    message: string;
    includeUnstaged: boolean;
    mode: CommitActionMode;
  }) => Promise<CommitExecutionResult>;
  onCommitted?: (result: CommitExecutionResult) => void;
};

export class CommitModal {
  #overlay: HTMLElement | null = null;
  #dialog: HTMLElement | null = null;
  #messageInput: HTMLTextAreaElement | null = null;
  #errorEl: HTMLElement | null = null;
  #includeUnstagedInput: HTMLInputElement | null = null;
  #summaryFilesEl: HTMLElement | null = null;
  #summaryAddsEl: HTMLElement | null = null;
  #summaryDelsEl: HTMLElement | null = null;
  #generateBtn: HTMLButtonElement | null = null;
  #continueBtn: HTMLButtonElement | null = null;
  #commitModeBtn: HTMLButtonElement | null = null;
  #commitAndPushModeBtn: HTMLButtonElement | null = null;
  #branchEl: HTMLElement | null = null;
  #context: CommitContext | null = null;
  #options: CommitModalOpenOptions | null = null;
  #mode: CommitActionMode = "commit";
  #isGenerating = false;
  #isSubmitting = false;
  #onWindowKeyDown: (event: KeyboardEvent) => void;

  constructor() {
    this.#onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.close();
      }
    };
  }

  open(options: CommitModalOpenOptions): void {
    this.close();
    this.#options = options;
    this.#context = options.context;
    this.#mode = "commit";
    this.#isGenerating = false;
    this.#isSubmitting = false;

    const closeBtn = h("button", {
      type: "button",
      class: "commit-modal-close",
      "aria-label": "Close",
      onclick: () => this.close(),
    }, ["\u00d7"]) as HTMLButtonElement;

    this.#branchEl = h("div", { class: "commit-modal-branch" }, [options.context.branch]);
    this.#summaryFilesEl = h("span", { class: "commit-modal-summary-files" }, [""]);
    this.#summaryAddsEl = h("span", { class: "commit-modal-summary-add" }, [""]);
    this.#summaryDelsEl = h("span", { class: "commit-modal-summary-del" }, [""]);

    this.#includeUnstagedInput = h("input", {
      type: "checkbox",
      checked: true,
      onchange: () => {
        this.#renderSummary();
        this.#clearError();
      },
    }) as HTMLInputElement;

    this.#messageInput = h("textarea", {
      class: "commit-modal-message",
      rows: 4,
      placeholder: "Leave blank to autogenerate a commit message",
      oninput: () => this.#clearError(),
    }) as HTMLTextAreaElement;

    this.#errorEl = h("div", {
      class: "commit-modal-error",
      hidden: true,
    });

    this.#generateBtn = h("button", {
      type: "button",
      class: "commit-modal-generate",
      onclick: () => {
        void this.#handleGenerate();
      },
    }, ["Generate"]) as HTMLButtonElement;

    this.#commitModeBtn = h("button", {
      type: "button",
      class: "commit-modal-mode active",
      onclick: () => this.#setMode("commit"),
    }, ["Commit"]) as HTMLButtonElement;

    this.#commitAndPushModeBtn = h("button", {
      type: "button",
      class: "commit-modal-mode",
      onclick: () => this.#setMode("commit_and_push"),
    }, ["Commit and push"]) as HTMLButtonElement;

    this.#continueBtn = h("button", {
      type: "button",
      class: "commit-modal-continue",
      onclick: () => {
        void this.#handleSubmit();
      },
    }, ["Continue"]) as HTMLButtonElement;

    this.#dialog = h("div", {
      class: "commit-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "commit-modal-title",
      onclick: (event: Event) => event.stopPropagation(),
    }, [
      h("div", { class: "commit-modal-header" }, [
        h("div", { id: "commit-modal-title", class: "commit-modal-title" }, ["Commit your changes"]),
        closeBtn,
      ]),
      h("div", { class: "commit-modal-info-grid" }, [
        h("span", { class: "commit-modal-label" }, ["Branch"]),
        this.#branchEl,
        h("span", { class: "commit-modal-label" }, ["Changes"]),
        h("div", { class: "commit-modal-summary" }, [
          this.#summaryFilesEl,
          this.#summaryAddsEl,
          this.#summaryDelsEl,
        ]),
      ]),
      h("label", { class: "commit-modal-toggle" }, [
        this.#includeUnstagedInput,
        h("span", { class: "commit-modal-toggle-slider", "aria-hidden": "true" }),
        h("span", { class: "commit-modal-toggle-text" }, ["Include unstaged"]),
      ]),
      h("div", { class: "commit-modal-field-header" }, [
        h("label", { class: "commit-modal-label commit-modal-label-plain" }, ["Commit message"]),
        this.#generateBtn,
      ]),
      this.#messageInput,
      this.#errorEl,
      h("div", { class: "commit-modal-next-steps-title" }, ["Next steps"]),
      h("div", { class: "commit-modal-modes" }, [
        this.#commitModeBtn,
        this.#commitAndPushModeBtn,
      ]),
      this.#continueBtn,
    ]);

    this.#overlay = h("div", {
      class: "commit-modal-overlay",
      onclick: () => this.close(),
    }, [this.#dialog]);

    document.body.appendChild(this.#overlay);
    window.addEventListener("keydown", this.#onWindowKeyDown);
    this.#renderSummary();
    this.#syncControls();
    requestAnimationFrame(() => {
      this.#messageInput?.focus();
    });
  }

  close(): void {
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
    window.removeEventListener("keydown", this.#onWindowKeyDown);

    this.#dialog = null;
    this.#messageInput = null;
    this.#errorEl = null;
    this.#includeUnstagedInput = null;
    this.#summaryFilesEl = null;
    this.#summaryAddsEl = null;
    this.#summaryDelsEl = null;
    this.#generateBtn = null;
    this.#continueBtn = null;
    this.#commitModeBtn = null;
    this.#commitAndPushModeBtn = null;
    this.#branchEl = null;
    this.#context = null;
    this.#options = null;
    this.#mode = "commit";
    this.#isGenerating = false;
    this.#isSubmitting = false;
  }

  get isOpen(): boolean {
    return Boolean(this.#overlay);
  }

  #setMode(mode: CommitActionMode): void {
    this.#mode = mode;
    this.#commitModeBtn?.classList.toggle("active", mode === "commit");
    this.#commitAndPushModeBtn?.classList.toggle("active", mode === "commit_and_push");
  }

  #hasSelectedChanges(): boolean {
    const context = this.#context;
    if (!context) return false;
    if (this.#includeUnstagedInput?.checked) {
      return context.hasChanges;
    }
    return context.stagedFiles > 0;
  }

  #selectedStats(): { files: number; additions: number; deletions: number } {
    const context = this.#context;
    if (!context) return { files: 0, additions: 0, deletions: 0 };
    if (this.#includeUnstagedInput?.checked) {
      return {
        files: context.totalFiles,
        additions: context.totalAdditions,
        deletions: context.totalDeletions,
      };
    }
    return {
      files: context.stagedFiles,
      additions: context.stagedAdditions,
      deletions: context.stagedDeletions,
    };
  }

  #renderSummary(): void {
    const { files, additions, deletions } = this.#selectedStats();
    if (this.#summaryFilesEl) {
      this.#summaryFilesEl.textContent = `${files} file${files === 1 ? "" : "s"}`;
    }
    if (this.#summaryAddsEl) {
      this.#summaryAddsEl.textContent = `+${formatNumber(additions)}`;
    }
    if (this.#summaryDelsEl) {
      this.#summaryDelsEl.textContent = `-${formatNumber(deletions)}`;
    }
    this.#syncControls();
  }

  #syncControls(): void {
    const hasChanges = this.#hasSelectedChanges();
    if (this.#generateBtn) {
      this.#generateBtn.disabled = this.#isGenerating || this.#isSubmitting || !hasChanges;
      this.#generateBtn.textContent = this.#isGenerating ? "Generating..." : "Generate";
    }
    if (this.#continueBtn) {
      this.#continueBtn.disabled = this.#isSubmitting || this.#isGenerating || !hasChanges;
      this.#continueBtn.textContent = this.#isSubmitting ? "Committing..." : "Continue";
    }
    if (this.#includeUnstagedInput) {
      this.#includeUnstagedInput.disabled = this.#isSubmitting || this.#isGenerating;
    }
    if (this.#messageInput) {
      this.#messageInput.disabled = this.#isSubmitting;
    }
    if (this.#commitModeBtn) {
      this.#commitModeBtn.disabled = this.#isSubmitting || this.#isGenerating;
    }
    if (this.#commitAndPushModeBtn) {
      this.#commitAndPushModeBtn.disabled = this.#isSubmitting || this.#isGenerating;
    }
  }

  async #handleGenerate(): Promise<string | null> {
    if (!this.#options) return null;
    if (!this.#hasSelectedChanges()) {
      this.#setError("No changes available for the selected scope.");
      return null;
    }

    this.#clearError();
    this.#isGenerating = true;
    this.#syncControls();
    try {
      const message = await this.#options.onGenerate(
        Boolean(this.#includeUnstagedInput?.checked)
      );
      const normalized = String(message ?? "").trim();
      if (!normalized) {
        throw new Error("Claude returned an empty commit message");
      }
      if (this.#messageInput) {
        this.#messageInput.value = normalized;
      }
      return normalized;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#setError(message || "Failed to generate commit message");
      return null;
    } finally {
      this.#isGenerating = false;
      this.#syncControls();
    }
  }

  async #handleSubmit(): Promise<void> {
    if (!this.#options) return;
    if (!this.#hasSelectedChanges()) {
      this.#setError("No changes available for the selected scope.");
      return;
    }

    this.#clearError();

    let message = this.#messageInput?.value.trim() ?? "";
    if (!message) {
      const generated = await this.#handleGenerate();
      if (!generated) return;
      message = generated.trim();
      if (!message) {
        this.#setError("Commit message cannot be empty.");
        return;
      }
    }

    this.#isSubmitting = true;
    this.#syncControls();
    try {
      const result = await this.#options.onSubmit({
        message,
        includeUnstaged: Boolean(this.#includeUnstagedInput?.checked),
        mode: this.#mode,
      });
      this.#options.onCommitted?.(result);
      this.close();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.#setError(errorMessage || "Failed to create commit");
    } finally {
      this.#isSubmitting = false;
      this.#syncControls();
    }
  }

  #setError(message: string): void {
    if (!this.#errorEl) return;
    this.#errorEl.textContent = message;
    this.#errorEl.hidden = false;
  }

  #clearError(): void {
    if (!this.#errorEl) return;
    this.#errorEl.hidden = true;
    this.#errorEl.textContent = "";
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
