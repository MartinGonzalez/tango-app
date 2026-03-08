import { describe, expect, test } from "bun:test";
import {
  UI_STYLE_ID,
  UI_STYLES,
  badge,
  button,
  checkbox,
  Icon,
  iconButton,
  dropdown,
  dropdownMenu,
  createRoot,
  ensureInstrumentUI,
  segmentedControl,
  tabs,
  group,
  groupEmpty,
  groupItem,
  groupList,
  listItem,
  selectionList,
  select,
  toggle,
} from "tango-api/ui";

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

  test("button supports optional left icon", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const icon = document.createElement("span");
    icon.textContent = "★";
    const btn = button({
      label: "Run",
      icon,
      variant: "primary",
    });

    const iconNode = btn.querySelector(".tui-btn-icon") as HTMLElement | null;
    const labelNode = btn.querySelector(".tui-btn-label") as HTMLElement | null;
    expect(iconNode).toBeTruthy();
    expect(labelNode?.textContent).toBe("Run");
    expect(btn.firstElementChild).toBe(iconNode);
  });

  test("button supports Tango icon names", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    const btn = button({
      label: "Create branch",
      icon: Icon.Branch,
      variant: "secondary",
    });

    const iconNode = btn.querySelector(".tui-icon.tui-btn-icon");
    expect(iconNode).toBeTruthy();
    expect(iconNode?.querySelector("svg")).toBeTruthy();
  });

  test("iconButton supports Tango icon names and click handlers", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let clicked = 0;
    const btn = iconButton({
      icon: Icon.Branch,
      label: "Toggle branch panel",
      onClick: () => {
        clicked += 1;
      },
    });

    expect(btn.className).toContain("tui-icon-btn");
    expect(btn.getAttribute("aria-label")).toBe("Toggle branch panel");
    expect(btn.querySelector(".tui-icon-btn-icon svg")).toBeTruthy();
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

    // happy-dom makes .value read-only on <select>, so select the option directly
    const optionB = node.querySelector('option[value="b"]') as HTMLOptionElement;
    optionB.selected = true;
    node.dispatchEvent(new Event("change"));
    expect(selected).toBe("b");
  });

  test("dropdown emits onChange value", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let selected = "";
    const node = dropdown({
      options: [
        { value: "github", label: "GitHub" },
        { value: "jira", label: "Jira" },
      ],
      value: "github",
      onChange: (value) => {
        selected = value;
      },
    });
    const trigger = node.querySelector(".tui-dropdown-select-trigger") as HTMLButtonElement;
    trigger.click();
    const option = node.querySelectorAll(".tui-dropdown-select-item")[1] as HTMLButtonElement;
    option.click();
    expect(selected).toBe("jira");
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

  test("toggle emits checked state", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let checked = false;
    const node = toggle({
      label: "Enabled",
      onChange: (value) => {
        checked = value;
      },
    });
    const input = node.querySelector("input") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(checked).toBe(true);
  });

  test("checkbox renders custom indicator and emits checked state", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let checked = false;
    const node = checkbox({
      label: "Remember me",
      onChange: (value) => {
        checked = value;
      },
    });
    expect(node.querySelector(".tui-checkbox-indicator")).toBeTruthy();
    const input = node.querySelector("input") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(checked).toBe(true);
  });

  test("segmentedControl emits option value on click", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let selected = "";
    const node = segmentedControl({
      value: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      onChange: (value) => {
        selected = value;
      },
    });
    const buttonNode = node.querySelectorAll("button")[1] as HTMLButtonElement;
    buttonNode.click();
    expect(selected).toBe("b");
  });

  test("tabs marks active trigger and emits selected value", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let nextValue = "";
    const panelA = document.createElement("div");
    panelA.textContent = "A";
    const panelB = document.createElement("div");
    panelB.textContent = "B";

    const node = tabs({
      value: "a",
      tabs: [
        { value: "a", label: "A", content: panelA },
        { value: "b", label: "B", content: panelB },
      ],
      onChange: (value) => {
        nextValue = value;
      },
    });

    const triggers = node.querySelectorAll(".tui-tabs-trigger");
    expect(triggers[0]?.getAttribute("aria-selected")).toBe("true");
    expect(triggers[1]?.getAttribute("aria-selected")).toBe("false");
    (triggers[1] as HTMLButtonElement).click();
    expect(nextValue).toBe("b");
  });

  test("selectionList emits single selection", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let selected: string[] = [];
    const node = selectionList({
      items: [
        { value: "a", title: "A" },
        { value: "b", title: "B" },
      ],
      selected: [],
      onChange: (next) => {
        selected = next;
      },
    });
    const buttonNode = node.querySelectorAll("button")[1] as HTMLButtonElement;
    buttonNode.click();
    expect(selected).toEqual(["b"]);
  });

  test("dropdownMenu emits selected item id", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }

    let picked = "";
    const node = dropdownMenu({
      label: "More",
      items: [
        { id: "copy", label: "Copy" },
        { id: "delete", label: "Delete", danger: true },
      ],
      onSelect: (id) => {
        picked = id;
      },
    });
    const buttonNode = node.querySelectorAll(".tui-dropdown-item")[1] as HTMLButtonElement;
    buttonNode.click();
    expect(picked).toBe("delete");
  });

  test("styles stay scoped to tui selectors", () => {
    const lines = UI_STYLES
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.some((line) => line.startsWith("button {"))).toBe(false);
    expect(lines.some((line) => line.startsWith("input {"))).toBe(false);
    expect(lines.some((line) => line.startsWith("body {"))).toBe(false);
    expect(UI_STYLES.includes(".tui-root")).toBe(true);
  });
});
