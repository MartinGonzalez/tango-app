import React from "react";
import { UIEmptyState, UIButton } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function EmptyStateBasicDemo() {
  return (
    <ComponentPreview label="Basic">
      <UIEmptyState title="No sessions yet" description="Start a new session to see it here." />
    </ComponentPreview>
  );
}

export function EmptyStateActionDemo() {
  return (
    <ComponentPreview label="With action">
      <UIEmptyState
        title="No instruments installed"
        description="Browse the catalog to find instruments for your workflow."
        action={<UIButton label="Browse Catalog" variant="primary" />}
      />
    </ComponentPreview>
  );
}
