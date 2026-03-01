import { parseHTML } from "linkedom";
import { describe, expect, test, beforeEach } from "bun:test";

// Set up DOM globals before importing the component
const parsed = parseHTML("<!DOCTYPE html><html><body></body></html>");

class KeyboardEventShim extends parsed.Event {
  key: string;
  code: string;
  constructor(type: string, init?: { key?: string; code?: string }) {
    super(type);
    this.key = init?.key ?? "";
    this.code = init?.code ?? "";
  }
}

Object.assign(globalThis, {
  window: parsed.window,
  document: parsed.document,
  HTMLElement: parsed.HTMLElement,
  Event: parsed.Event,
  KeyboardEvent: KeyboardEventShim,
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
});

// Import after DOM globals are ready
const { ErrorModal } = await import("../src/mainview/components/error-modal.ts");

describe("ErrorModal", () => {
  let modal: ErrorModal;

  beforeEach(() => {
    document.querySelectorAll(".error-modal-overlay").forEach((el: any) => el.remove());
    modal = new ErrorModal();
  });

  test("show() creates overlay on body", () => {
    modal.show("test-context", "Something broke");

    const overlay = document.querySelector(".error-modal-overlay");
    expect(overlay).not.toBeNull();
    expect(document.body.contains(overlay)).toBe(true);
  });

  test("show() does NOT destroy #app content", () => {
    const app = document.createElement("div");
    app.id = "app";
    app.textContent = "My app content";
    document.body.appendChild(app);

    modal.show("test-context", new Error("kaboom"));

    expect(app.textContent).toBe("My app content");
    expect(document.body.contains(app)).toBe(true);

    app.remove();
  });

  test("close() removes overlay", () => {
    modal.show("test-context", "error details");
    expect(document.querySelector(".error-modal-overlay")).not.toBeNull();

    modal.close();
    expect(document.querySelector(".error-modal-overlay")).toBeNull();
  });

  test("Escape key dismisses modal", () => {
    modal.show("test-context", "error details");
    expect(modal.isOpen).toBe(true);

    window.dispatchEvent(new KeyboardEventShim("keydown", { key: "Escape" }));
    expect(modal.isOpen).toBe(false);
    expect(document.querySelector(".error-modal-overlay")).toBeNull();
  });

  test("multiple show() calls stack entries in one overlay", () => {
    modal.show("context-1", "first error");
    modal.show("context-2", "second error");

    const overlays = document.querySelectorAll(".error-modal-overlay");
    expect(overlays.length).toBe(1);

    const entries = document.querySelectorAll(".error-modal-entry");
    expect(entries.length).toBe(2);
  });

  test("isOpen reflects state", () => {
    expect(modal.isOpen).toBe(false);

    modal.show("ctx", "err");
    expect(modal.isOpen).toBe(true);

    modal.close();
    expect(modal.isOpen).toBe(false);
  });

  test("overlay background click dismisses", () => {
    modal.show("ctx", "err");
    expect(modal.isOpen).toBe(true);

    const overlay = document.querySelector(".error-modal-overlay") as any;
    overlay.click();

    expect(modal.isOpen).toBe(false);
  });

  test("clicking dialog does not dismiss", () => {
    modal.show("ctx", "err");

    const dialog = document.querySelector(".error-modal") as any;
    dialog.click();

    expect(modal.isOpen).toBe(true);
  });

  test("show() displays context and error text", () => {
    modal.show("instrument.crash", new Error("Permission denied"));

    const context = document.querySelector(".error-modal-context");
    expect(context?.textContent).toContain("instrument.crash");

    const stack = document.querySelector(".error-modal-stack");
    expect(stack?.textContent).toContain("Permission denied");
  });

  test("show() with boot trace lines renders them", () => {
    modal.show("init", "failure", ["line-1", "line-2"]);

    const traceEl = document.querySelector(".error-modal-trace");
    expect(traceEl?.textContent).toContain("line-1");
    expect(traceEl?.textContent).toContain("line-2");
  });

  test("close button dismisses modal", () => {
    modal.show("ctx", "err");

    const closeBtn = document.querySelector(".error-modal-close") as any;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(modal.isOpen).toBe(false);
  });

  test("same error object is deduplicated", () => {
    const err = new Error("boom");
    modal.show("ctx-a", err);
    modal.show("ctx-b", err);

    const entries = document.querySelectorAll(".error-modal-entry");
    expect(entries.length).toBe(1);
  });

  test("same string error+context is deduplicated", () => {
    modal.show("ctx", "same message");
    modal.show("ctx", "same message");

    const entries = document.querySelectorAll(".error-modal-entry");
    expect(entries.length).toBe(1);
  });

  test("different errors still stack", () => {
    modal.show("ctx-a", new Error("first"));
    modal.show("ctx-b", new Error("second"));

    const entries = document.querySelectorAll(".error-modal-entry");
    expect(entries.length).toBe(2);
  });

  test("each entry has a copy button", () => {
    modal.show("ctx", new Error("copy me"));

    const copyBtn = document.querySelector(".error-modal-copy") as any;
    expect(copyBtn).not.toBeNull();
  });

  test("copy button writes context + error to clipboard", async () => {
    // Shim clipboard API
    let copied = "";
    (globalThis.navigator as any).clipboard = {
      writeText: (text: string) => { copied = text; return Promise.resolve(); },
    };

    modal.show("my.context", new Error("details here"));

    const copyBtn = document.querySelector(".error-modal-copy") as any;
    copyBtn.click();
    await Promise.resolve(); // flush microtask

    expect(copied).toContain("my.context");
    expect(copied).toContain("details here");
  });
});
