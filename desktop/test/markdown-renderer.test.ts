import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/mainview/components/chat-view.ts";

describe("renderMarkdown tables", () => {
  test("renders GFM table structure", () => {
    const markdown = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 10 |",
      "| Beta | 20 |",
    ].join("\n");

    const html = renderMarkdown(markdown);
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain("<thead><tr>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
  });

  test("supports column alignment markers", () => {
    const markdown = [
      "| Left | Center | Right |",
      "| :--- | :----: | ----: |",
      "| A | B | C |",
    ].join("\n");

    const html = renderMarkdown(markdown);
    expect(html).toContain('class="md-align-left"');
    expect(html).toContain('class="md-align-center"');
    expect(html).toContain('class="md-align-right"');
  });

  test("does not render non-table lines as table", () => {
    const markdown = [
      "a | b",
      "this is not a divider",
      "still paragraph",
    ].join("\n");

    const html = renderMarkdown(markdown);
    expect(html).not.toContain('class="md-table"');
    expect(html).toContain("<p>");
  });
});
