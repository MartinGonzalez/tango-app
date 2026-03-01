import { h } from "../lib/dom.ts";

function stringifyError(error: unknown): string {
  if (error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n${error.stack}` : error.message;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export class ErrorModal {
  #overlay: HTMLElement | null = null;
  #entriesContainer: HTMLElement | null = null;
  #seenErrors = new WeakSet<object>();
  #seenMessages = new Set<string>();
  #onWindowKeyDown: (event: KeyboardEvent) => void;

  constructor() {
    this.#onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.close();
      }
    };
  }

  get isOpen(): boolean {
    return Boolean(this.#overlay);
  }

  show(context: string, error: unknown, bootTrace?: string[]): void {
    // Deduplicate: skip if we've already shown the exact same error
    if (error != null && typeof error === "object") {
      if (this.#seenErrors.has(error)) return;
      this.#seenErrors.add(error);
    } else {
      const key = `${context}\0${String(error)}`;
      if (this.#seenMessages.has(key)) return;
      this.#seenMessages.add(key);
    }

    if (!this.#overlay) {
      this.#entriesContainer = h("div", { class: "error-modal-entries" });

      const closeBtn = h("button", {
        type: "button",
        class: "error-modal-close",
        "aria-label": "Close",
        onclick: () => this.close(),
      }, ["\u00d7"]) as HTMLButtonElement;

      const dialog = h("div", {
        class: "error-modal",
        role: "dialog",
        "aria-modal": "true",
        onclick: (event: Event) => event.stopPropagation(),
      }, [
        h("div", { class: "error-modal-header" }, [
          h("div", { class: "error-modal-title" }, ["Something went wrong"]),
          closeBtn,
        ]),
        this.#entriesContainer,
      ]);

      this.#overlay = h("div", {
        class: "error-modal-overlay",
        onclick: () => this.close(),
      }, [dialog]);

      document.body.appendChild(this.#overlay);
      window.addEventListener("keydown", this.#onWindowKeyDown);
    }

    const errorText = stringifyError(error);
    const traceText = bootTrace?.length ? bootTrace.join("\n") : "";

    // Build the plain-text blob for clipboard
    const clipboardParts = [context, errorText];
    if (traceText) clipboardParts.push("Boot trace:\n" + traceText);
    const clipboardText = clipboardParts.join("\n\n");

    const copyBtn = h("button", {
      type: "button",
      class: "error-modal-copy",
      "aria-label": "Copy error",
      onclick: () => {
        void navigator.clipboard.writeText(clipboardText).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
        });
      },
    }, ["Copy"]) as HTMLButtonElement;

    const entryChildren: (HTMLElement | string)[] = [
      h("div", { class: "error-modal-entry-header" }, [
        h("div", { class: "error-modal-context" }, [context]),
        copyBtn,
      ]),
      h("pre", { class: "error-modal-stack" }, [errorText]),
    ];

    if (traceText) {
      entryChildren.push(
        h("div", { class: "error-modal-trace-label" }, ["Boot trace"]),
        h("pre", { class: "error-modal-trace" }, [traceText]),
      );
    }

    const entry = h("div", { class: "error-modal-entry" }, entryChildren);
    this.#entriesContainer!.appendChild(entry);
  }

  close(): void {
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
    this.#entriesContainer = null;
    this.#seenErrors = new WeakSet<object>();
    this.#seenMessages.clear();
    window.removeEventListener("keydown", this.#onWindowKeyDown);
  }
}
