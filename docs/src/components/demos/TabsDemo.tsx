import React from "react";
import { UITabs, UIButton } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function TabsUncontrolledDemo() {
  return (
    <ComponentPreview label="Uncontrolled">
      <UITabs
        initialValue="overview"
        tabs={[
          { value: "overview", label: "Overview", content: <div>Overview content goes here.</div> },
          { value: "details", label: "Details", content: <div>Detailed information panel.</div> },
          { value: "settings", label: "Settings", content: <div>Settings and configuration.</div> },
        ]}
      />
    </ComponentPreview>
  );
}

export function TabsActionsDemo() {
  return (
    <ComponentPreview label="With right actions">
      <UITabs
        initialValue="code"
        tabs={[
          { value: "code", label: "Code", content: <div>Source code view.</div> },
          { value: "preview", label: "Preview", content: <div>Live preview.</div> },
        ]}
        rightActions={<UIButton label="Copy" variant="ghost" size="sm" />}
      />
    </ComponentPreview>
  );
}
