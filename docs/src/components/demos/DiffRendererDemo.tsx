import React from "react";
import { UIDiffRenderer, parseDiff } from "tango-api";
import { ComponentPreview } from "../ComponentPreview.tsx";

const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { serve } from "bun";
+import { logger } from "./logger";

 const server = serve({
-  port: 3000,
+  port: process.env.PORT || 3000,
   fetch(req) {
diff --git a/src/logger.ts b/src/logger.ts
new file mode 100644
--- /dev/null
+++ b/src/logger.ts
@@ -0,0 +1,4 @@
+export function logger(msg: string) {
+  const timestamp = new Date().toISOString();
+  console.log(\`[\${timestamp}] \${msg}\`);
+}
`;

const files = parseDiff(sampleDiff);

export function DiffUnifiedDemo() {
  return (
    <ComponentPreview label="Unified diff">
      <UIDiffRenderer files={files} viewMode="unified" />
    </ComponentPreview>
  );
}

export function DiffSplitDemo() {
  return (
    <ComponentPreview label="Split diff">
      <UIDiffRenderer files={files} viewMode="split" />
    </ComponentPreview>
  );
}
