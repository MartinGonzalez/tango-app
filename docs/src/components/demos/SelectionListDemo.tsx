import React, { useState } from "react";
import { UISelectionList } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

export function SelectionListSingleDemo() {
  const [selected, setSelected] = useState(["react"]);
  return (
    <ComponentPreview label="Single select">
      <UISelectionList
        items={[
          { value: "react", title: "React", subtitle: "A JavaScript library for building UIs" },
          { value: "vue", title: "Vue", subtitle: "The progressive JavaScript framework" },
          { value: "svelte", title: "Svelte", subtitle: "Cybernetically enhanced web apps" },
        ]}
        selected={selected}
        onChange={setSelected}
      />
    </ComponentPreview>
  );
}

export function SelectionListMultiDemo() {
  const [selected, setSelected] = useState(["ts", "rs"]);
  return (
    <ComponentPreview label="Multi select">
      <UISelectionList
        multiple
        items={[
          { value: "ts", title: "TypeScript" },
          { value: "js", title: "JavaScript" },
          { value: "py", title: "Python" },
          { value: "rs", title: "Rust" },
        ]}
        selected={selected}
        onChange={setSelected}
      />
    </ComponentPreview>
  );
}
