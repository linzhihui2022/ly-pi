// parser.ts
import type { ChangedFile, DiffHunk, DiffSummary } from "./types";

export function parseDiff(diffText: string): DiffSummary {
  const lines = diffText.split("\n");
  const changedFiles: ChangedFile[] = [];
  let currentFile: ChangedFile | undefined;
  let currentHunk: DiffHunk | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      if (currentFile) {
        changedFiles.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      const path = match ? match[2] : "";
      currentFile = {
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = undefined;
    } else if (line.startsWith("new file mode ")) {
      if (currentFile) currentFile.status = "added";
    } else if (line.startsWith("deleted file mode ")) {
      if (currentFile) currentFile.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      if (currentFile) currentFile.status = "renamed";
    } else if (line.startsWith("@@ ")) {
      if (currentFile) {
        const hunk = parseHunkHeader(line);
        currentHunk = hunk;
        currentFile.hunks.push(hunk);
      }
    } else if (currentHunk && currentFile) {
      currentHunk.lines.push(line);
      if (line.startsWith("+")) {
        currentFile.additions++;
      } else if (line.startsWith("-")) {
        currentFile.deletions++;
      }
    }
  }

  if (currentFile) {
    changedFiles.push(currentFile);
  }

  return {
    totalFiles: changedFiles.length,
    additions: changedFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: changedFiles.reduce((sum, f) => sum + f.deletions, 0),
    changedFiles,
  };
}

function parseHunkHeader(line: string): DiffHunk {
  const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return { oldStart: 0, oldCount: 0, newStart: 0, newCount: 0, lines: [] };
  }
  return {
    oldStart: parseInt(match[1], 10),
    oldCount: parseInt(match[2] ?? "0", 10),
    newStart: parseInt(match[3], 10),
    newCount: parseInt(match[4] ?? "0", 10),
    lines: [],
  };
}
