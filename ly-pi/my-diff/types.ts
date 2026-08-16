/** A file with changes relative to HEAD. */
export interface ChangedFile {
  /** Single-letter status: M = modified (incl. deleted/renamed/conflicted), A = added, ? = untracked. */
  status: "M" | "A" | "?";
  /** Repo-relative path. */
  path: string;
}

/** Render-ready diff view model. */
export interface DiffView {
  /** Title line, e.g. "M src/a.ts". */
  title: string;
  /** Raw diff/content lines. */
  lines: string[];
}

/** Semantic class of a single diff line. */
export type DiffLineKind = "added" | "removed" | "context";
