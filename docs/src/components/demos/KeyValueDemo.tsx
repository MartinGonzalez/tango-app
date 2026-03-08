import React from "react";
import { UIKeyValue, UIBadge } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function KeyValueBasicDemo() {
  return (
    <ComponentPreview label="Default">
      <UIKeyValue items={[
        { label: "Status", value: "Running" },
        { label: "Duration", value: "3m 42s" },
        { label: "Model", value: "claude-sonnet-4-20250514" },
        { label: "Tokens", value: "12,345" },
      ]} />
    </ComponentPreview>
  );
}

export function KeyValueRichDemo() {
  return (
    <ComponentPreview label="With custom label width and rich values">
      <UIKeyValue
        labelWidth="120px"
        items={[
          { label: "Status", value: <UIBadge label="Active" tone="success" /> },
          { label: "Priority", value: <UIBadge label="High" tone="warning" /> },
          { label: "Assignee", value: "Martin" },
        ]}
      />
    </ComponentPreview>
  );
}
