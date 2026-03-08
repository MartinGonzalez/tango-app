import React, { useState } from "react";
import { UIGroup, UIGroupList, UIGroupItem, UIGroupEmpty, UIBadge, UIIconButton, Icon } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function GroupExpandedDemo() {
  const [expanded, setExpanded] = useState(true);
  return (
    <ComponentPreview label="Expanded group with items">
      <UIGroup title="Source Files" subtitle="3 files" expanded={expanded} onToggle={setExpanded}>
        <UIGroupList>
          <UIGroupItem title="index.ts" subtitle="src/" onClick={() => {}} />
          <UIGroupItem title="server.ts" subtitle="src/" onClick={() => {}} />
          <UIGroupItem title="types.ts" subtitle="src/" active onClick={() => {}} />
        </UIGroupList>
      </UIGroup>
    </ComponentPreview>
  );
}

export function GroupCollapsedDemo() {
  const [expanded, setExpanded] = useState(false);
  return (
    <ComponentPreview label="Collapsed group">
      <UIGroup title="Tests" subtitle="5 files" expanded={expanded} onToggle={setExpanded}>
        <UIGroupList>
          <UIGroupItem title="Won't be visible" />
        </UIGroupList>
      </UIGroup>
    </ComponentPreview>
  );
}

export function GroupMetaDemo() {
  const [expanded, setExpanded] = useState(true);
  return (
    <ComponentPreview label="With metadata and actions">
      <UIGroup
        title="Pull Request #42"
        subtitle="feat: add dark mode"
        expanded={expanded}
        onToggle={setExpanded}
        meta={<UIBadge label="Open" tone="success" />}
        actions={<UIIconButton icon={Icon.ExternalLink} label="Open in browser" />}
      >
        <UIGroupList>
          <UIGroupItem title="src/theme.ts" subtitle="+42 -10" meta={<UIBadge label="Modified" tone="info" />} />
          <UIGroupItem title="src/colors.ts" subtitle="+15 -3" meta={<UIBadge label="Modified" tone="info" />} />
        </UIGroupList>
      </UIGroup>
    </ComponentPreview>
  );
}

export function GroupEmptyDemo() {
  const [expanded, setExpanded] = useState(true);
  return (
    <ComponentPreview label="Empty group">
      <UIGroup title="Recent Activity" expanded={expanded} onToggle={setExpanded}>
        <UIGroupList>
          <UIGroupEmpty text="No activity yet" />
        </UIGroupList>
      </UIGroup>
    </ComponentPreview>
  );
}
