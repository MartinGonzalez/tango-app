import { describe, test, expect } from "bun:test";
import { parseDiff } from "../src/mainview/components/diff-parser.ts";

describe("parseDiff", () => {
  test("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   ")).toEqual([]);
  });

  test("parses a simple file addition", () => {
    const raw = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
index 0000000..abcdef1
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return "world";
+}
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("new-file.ts");
    expect(files[0].status).toBe("added");
    expect(files[0].isBinary).toBe(false);
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].lines).toHaveLength(3);
    expect(files[0].hunks[0].lines[0].type).toBe("add");
    expect(files[0].hunks[0].lines[0].content).toBe('export function hello() {');
    expect(files[0].hunks[0].lines[0].newLineNo).toBe(1);
    expect(files[0].hunks[0].lines[0].oldLineNo).toBeNull();
  });

  test("parses a file deletion", () => {
    const raw = `diff --git a/old-file.js b/old-file.js
deleted file mode 100644
index abcdef1..0000000
--- a/old-file.js
+++ /dev/null
@@ -1,2 +0,0 @@
-const x = 1;
-const y = 2;
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("deleted");
    expect(files[0].hunks[0].lines).toHaveLength(2);
    expect(files[0].hunks[0].lines[0].type).toBe("delete");
    expect(files[0].hunks[0].lines[0].oldLineNo).toBe(1);
    expect(files[0].hunks[0].lines[0].newLineNo).toBeNull();
  });

  test("parses a modification with context lines", () => {
    const raw = `diff --git a/src/app.ts b/src/app.ts
index abcdef1..1234567 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,7 +5,7 @@ import { foo } from "./foo";
 const a = 1;
 const b = 2;
-const c = 3;
+const c = 42;
 const d = 4;
 const e = 5;
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/app.ts");
    expect(files[0].status).toBe("modified");
    expect(files[0].hunks[0].lines).toHaveLength(6);

    // Context lines
    expect(files[0].hunks[0].lines[0].type).toBe("context");
    expect(files[0].hunks[0].lines[0].oldLineNo).toBe(5);
    expect(files[0].hunks[0].lines[0].newLineNo).toBe(5);

    expect(files[0].hunks[0].lines[1].type).toBe("context");

    // Delete line
    expect(files[0].hunks[0].lines[2].type).toBe("delete");
    expect(files[0].hunks[0].lines[2].content).toBe("const c = 3;");

    // Add line
    expect(files[0].hunks[0].lines[3].type).toBe("add");
    expect(files[0].hunks[0].lines[3].content).toBe("const c = 42;");

    // Trailing context
    expect(files[0].hunks[0].lines[4].type).toBe("context");
    expect(files[0].hunks[0].lines[5].type).toBe("context");
  });

  test("parses a rename", () => {
    const raw = `diff --git a/old-name.ts b/new-name.ts
rename from old-name.ts
rename to new-name.ts
index abcdef1..1234567 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 line3
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("new-name.ts");
    expect(files[0].oldPath).toBe("old-name.ts");
    expect(files[0].status).toBe("renamed");
  });

  test("parses binary files", () => {
    const raw = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abcdef1
Binary files /dev/null and b/image.png differ
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("image.png");
    expect(files[0].isBinary).toBe(true);
    expect(files[0].hunks).toHaveLength(0);
  });

  test("parses multiple files", () => {
    const raw = `diff --git a/file1.ts b/file1.ts
index abcdef1..1234567 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
diff --git a/file2.ts b/file2.ts
new file mode 100644
index 0000000..abcdef1
--- /dev/null
+++ b/file2.ts
@@ -0,0 +1,1 @@
+hello
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("file1.ts");
    expect(files[1].path).toBe("file2.ts");
    expect(files[1].status).toBe("added");
  });

  test("parses hunk header with correct start/count", () => {
    const raw = `diff --git a/f.ts b/f.ts
index abcdef1..1234567 100644
--- a/f.ts
+++ b/f.ts
@@ -10,6 +10,8 @@ function foo() {
 ctx1
 ctx2
+new1
+new2
 ctx3
 ctx4
`;
    const files = parseDiff(raw);
    const hunk = files[0].hunks[0];
    expect(hunk.oldStart).toBe(10);
    expect(hunk.oldCount).toBe(6);
    expect(hunk.newStart).toBe(10);
    expect(hunk.newCount).toBe(8);
  });
});
