import type { DiffFile, DiffHunk, DiffLine } from "../../shared/types.ts";

/**
 * Parses unified diff output into structured DiffFile objects.
 */
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const file = parseFileSection(section);
    if (file) files.push(file);
  }

  return files;
}

function parseFileSection(section: string): DiffFile | null {
  const lines = section.split("\n");
  if (lines.length === 0) return null;

  // First line: "a/path b/path"
  const headerMatch = lines[0].match(/^a\/(.+?)\s+b\/(.+?)$/);
  if (!headerMatch) return null;

  const oldPath = headerMatch[1];
  const newPath = headerMatch[2];

  // Detect binary files
  if (section.includes("Binary files ")) {
    return {
      path: newPath,
      oldPath: oldPath !== newPath ? oldPath : null,
      status: "modified",
      hunks: [],
      isBinary: true,
    };
  }

  // Detect status
  let status: DiffFile["status"] = "modified";
  if (section.includes("new file mode")) {
    status = "added";
  } else if (section.includes("deleted file mode")) {
    status = "deleted";
  } else if (section.includes("rename from") || oldPath !== newPath) {
    status = "renamed";
  }

  // Parse hunks
  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const hunkMatch = line.match(hunkRegex);

    if (hunkMatch) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] ?? "1", 10),
        lines: [],
      };
      hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        oldLineNo: null,
        newLineNo: newLine++,
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "delete",
        content: line.slice(1),
        oldLineNo: oldLine++,
        newLineNo: null,
      });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
    // Skip empty lines and lines starting with \ (No newline at end of file)
  }

  return {
    path: newPath,
    oldPath: oldPath !== newPath ? oldPath : null,
    status,
    hunks,
    isBinary: false,
  };
}
