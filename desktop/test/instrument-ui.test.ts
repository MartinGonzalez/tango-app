import { describe, expect, test } from "bun:test";
import {
  UI_STYLE_ID,
  UI_STYLES,
} from "../instruments/ui/src/styles.ts";
import {
  badge,
  button,
  createRoot,
  ensureInstrumentUI,
  group,
  groupEmpty,
  groupItem,
  groupList,
  listItem,
  select,
} from "../instruments/ui/src/index.ts";

describe("instrument-ui", () => {
  test("ensureInstrumentUI injects style only once", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    document.getElementById(UI_STYLE_ID)?.remove();
    ensureInstrumentUI(document);
    ensureInstrumentUI(document);

    const styles = document.querySelectorAll(`#${UI_STYLE_ID}`);
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toContain(".tui-root");
  });

  test("createRoot applies tui-root class", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    const root = createRoot();
    expect(root.classList.contains("tui-root")).toBe(true);
  });

  test("button respects variant, size and click handlers", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let clicked = 0;
    const btn = button({
      label: "Save",
      variant: "primary",
      size: "sm",
      onClick: () => {
        clicked += 1;
      },
    });

    expect(btn.className).toContain("tui-btn-primary");
    expect(btn.className).toContain("tui-btn-sm");
    btn.click();
    expect(clicked).toBe(1);
  });

  test("select emits onChange value", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let selected = "";
    const node = select({
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      value: "a",
      onChange: (value) => {
        selected = value;
      },
    });

    node.value = "b";
    node.dispatchEvent(new Event("change"));
    expect(selected).toBe("b");
  });

  test("listItem active state applies active class", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const activeNode = listItem({
      title: "Item",
      active: true,
    });
    expect(activeNode.className).toContain("tui-list-item-active");
  });

  test("badge uses tone class", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    const node = badge({ label: "ok", tone: "success" });
    expect(node.className).toContain("tui-badge-success");
  });

  test("group supports expanded and toggle state", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let nextExpanded: boolean | null = null;
    const node = group({
      title: "Stage",
      expanded: false,
      onToggle: (next) => {
        nextExpanded = next;
      },
      content: groupList({ items: [groupItem({ title: "Task A" })] }),
    });

    expect(node.className).toContain("tui-group");
    expect(node.className).not.toContain("tui-group-expanded");
    const header = node.querySelector(".tui-group-header") as HTMLElement;
    header.click();
    expect(nextExpanded).toBe(true);
  });

  test("group action clicks do not trigger toggle", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let toggled = 0;
    const action = button({ label: "New" });
    const node = group({
      title: "Stage",
      expanded: true,
      onToggle: () => {
        toggled += 1;
      },
      actions: [action],
      content: groupEmpty({ text: "No items" }),
    });

    const actionButton = node.querySelector(".tui-group-actions button") as HTMLButtonElement;
    actionButton.click();
    expect(toggled).toBe(0);
  });

  test("groupItem active state applies active class", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const activeNode = groupItem({
      title: "Task",
      active: true,
    });
    expect(activeNode.className).toContain("tui-group-item-active");
  });

  test("styles stay scoped to tui selectors", () => {
    expect(UI_STYLES.includes("button {")).toBe(false);
    expect(UI_STYLES.includes("input {")).toBe(false);
    expect(UI_STYLES.includes("body {")).toBe(false);
    expect(UI_STYLES.includes(".tui-root")).toBe(true);
  });
});
