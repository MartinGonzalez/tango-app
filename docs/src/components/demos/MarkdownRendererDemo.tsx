import React from "react";
import { UIMarkdownRendererBase } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

function simpleRenderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}

const sampleMarkdown = `## Hello World

This is a **markdown** preview with \`inline code\` and formatting.

### Features

- Preview and raw toggle
- Code block copy buttons
- Image lightbox on click`;

export function MarkdownPreviewDemo() {
  return (
    <ComponentPreview label="Preview mode">
      <UIMarkdownRendererBase
        content={sampleMarkdown}
        renderMarkdown={simpleRenderMarkdown}
      />
    </ComponentPreview>
  );
}

export function MarkdownRawDemo() {
  return (
    <ComponentPreview label="With raw toggle">
      <UIMarkdownRendererBase
        content={sampleMarkdown}
        renderMarkdown={simpleRenderMarkdown}
        rawViewEnabled
      />
    </ComponentPreview>
  );
}
