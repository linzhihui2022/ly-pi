import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { renderWorktreeLines } from "./render";

function createTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
  };
}

describe("renderWorktreeLines", () => {
  it("uses a Todo-style heading and tree rows", () => {
    const theme = createTheme();
    const lines = renderWorktreeLines(
      theme as never,
      [
        { path: "/repo", label: "main", isCurrent: false },
        {
          path: "/repo/.worktree/feature-x",
          label: "feature-x",
          isCurrent: true,
        },
      ],
      120,
      "/repo",
    );

    expect(lines).toEqual([
      "● Worktrees (2)",
      "├─ ○ main <REPO>",
      "└─ ● feature-x <REPO>/.worktree/feature-x",
    ]);
    expect(theme.fg).toHaveBeenCalledWith("accent", "Worktrees (2)");
    expect(theme.fg).toHaveBeenCalledWith("dim", "├─ ");
    expect(theme.fg).toHaveBeenCalledWith("accent", "● feature-x");
  });

  it("leaves worktrees outside the repository root absolute", () => {
    const theme = createTheme();
    const lines = renderWorktreeLines(
      theme as never,
      [
        { path: "/repo", label: "main", isCurrent: false },
        {
          path: "/repo-other/feature-x",
          label: "feature-x",
          isCurrent: true,
        },
      ],
      120,
      "/repo",
    );

    expect(lines[2]).toBe("└─ ● feature-x /repo-other/feature-x");
  });

  it("truncates the beginning of a long path without exceeding the width", () => {
    const theme = createTheme();
    const [, line] = renderWorktreeLines(
      theme as never,
      [
        {
          path: "/Users/you/project/.worktree/feature-x",
          label: "feature-x",
          isCurrent: true,
        },
      ],
      33,
      "/other/repository",
    );

    expect(line).toBe("└─ ● feature-x …orktree/feature-x");
    expect(visibleWidth(line)).toBeLessThanOrEqual(33);
  });

  it("keeps every rendered row width-safe", () => {
    const theme = createTheme();
    const worktree = [
      { path: "/Users/you/project", label: "x", isCurrent: false },
    ];

    for (const width of [0, 5]) {
      expect(
        renderWorktreeLines(
          theme as never,
          worktree,
          width,
          "/other/repository",
        ).every((line) => visibleWidth(line) <= width),
      ).toBe(true);
    }
  });
});
