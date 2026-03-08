import React from "react";
import { UICard, UIBadge, UIKeyValue } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function CardBasicDemo() {
  return (
    <ComponentPreview label="Basic card">
      <UICard>
        <div style={{ padding: "12px" }}>
          This is a card with some content inside.
        </div>
      </UICard>
    </ComponentPreview>
  );
}

export function CardStructuredDemo() {
  return (
    <ComponentPreview label="Card with structured content">
      <UICard>
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Session #42</strong>
            <UIBadge label="Running" tone="success" />
          </div>
          <UIKeyValue items={[
            { label: "Duration", value: "2m 30s" },
            { label: "Tokens", value: "1,234" },
          ]} />
        </div>
      </UICard>
    </ComponentPreview>
  );
}
