import React from "react";
import { UIRoot } from "tango-api";

export function ComponentPreview({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div
      style={{
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid #333",
        marginBlock: "1rem",
      }}
    >
      {label && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            color: "#888",
            background: "#1a1a1a",
            borderBottom: "1px solid #333",
            fontFamily: "monospace",
          }}
        >
          {label}
        </div>
      )}
      <UIRoot>
        <div style={{ padding: "16px" }}>{children}</div>
      </UIRoot>
    </div>
  );
}
