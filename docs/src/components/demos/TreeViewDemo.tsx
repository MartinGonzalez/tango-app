import React, { useState } from "react";
import { UITreeView, buildTree, UIBadge } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

type FileItem = { path: string; status: string };

const sampleFiles: FileItem[] = [
  { path: "src/index.ts", status: "modified" },
  { path: "src/server.ts", status: "added" },
  { path: "src/utils/helpers.ts", status: "modified" },
  { path: "src/utils/format.ts", status: "added" },
  { path: "test/index.test.ts", status: "modified" },
  { path: "package.json", status: "modified" },
];

const tree = buildTree(sampleFiles, (f) => f.path);

export function TreeViewDemo() {
  const [active, setActive] = useState<string | null>("src/server.ts");
  return (
    <ComponentPreview label="File tree">
      <UITreeView
        node={tree}
        itemPath={(item: FileItem) => item.path}
        activeItem={active}
        onItemClick={setActive}
        renderItemMeta={(item: FileItem) => (
          <UIBadge label={item.status} tone={item.status === "added" ? "success" : "info"} />
        )}
      />
    </ComponentPreview>
  );
}
