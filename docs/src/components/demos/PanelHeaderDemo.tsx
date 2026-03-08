import React from "react";
import { UIPanelHeader, UIIconButton, Icon } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function PanelHeaderBasicDemo() {
  return (
    <ComponentPreview label="Basic">
      <UIPanelHeader title="My Instrument" />
    </ComponentPreview>
  );
}

export function PanelHeaderSubtitleDemo() {
  return (
    <ComponentPreview label="With subtitle">
      <UIPanelHeader title="Pull Requests" subtitle="3 open" />
    </ComponentPreview>
  );
}

export function PanelHeaderBackDemo() {
  return (
    <ComponentPreview label="With back button">
      <UIPanelHeader title="Details" subtitle="PR #42" onBack={() => {}} />
    </ComponentPreview>
  );
}

export function PanelHeaderActionsDemo() {
  return (
    <ComponentPreview label="With right actions">
      <UIPanelHeader
        title="Sessions"
        rightActions={
          <div style={{ display: "flex", gap: "4px" }}>
            <UIIconButton icon={Icon.Play} label="Run" />
            <UIIconButton icon={Icon.ExternalLink} label="Open" />
          </div>
        }
      />
    </ComponentPreview>
  );
}
