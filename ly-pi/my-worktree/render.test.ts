import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { renderWorktreeLines } from "./render";

function createTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
  };
}

describe("renderWorktreeLines", () => {
  it("renders an aggregate heading and one neutral Current Worktree row", () => {
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
      "└─ • feature-x <REPO>/.worktree/feature-x",
    ]);
    expect(theme.fg).toHaveBeenCalledWith("accent", "Worktrees (2)");
    expect(theme.fg).toHaveBeenCalledWith("text", "• feature-x");
    expect(theme.fg).not.toHaveBeenCalledWith("accent", "• feature-x");
  });

  it("leaves a Current Worktree outside the repository root absolute", () => {
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

    expect(lines[1]).toBe("└─ • feature-x /repo-other/feature-x");
  });

  it("abbreviates the primary Current Worktree root", () => {
    const theme = createTheme();

    expect(
      renderWorktreeLines(
        theme as never,
        [
          { path: "/repo", label: "main", isCurrent: true },
          { path: "/repo-other", label: "feature-x", isCurrent: false },
        ],
        120,
        "/repo",
      )[1],
    ).toBe("└─ • main <REPO>");
  });

  it("truncates the beginning of a long path without exceeding the width", () => {
    const theme = createTheme();
    const [, line] = renderWorktreeLines(
      theme as never,
      [
        { path: "/Users/you/other", label: "main", isCurrent: false },
        {
          path: "/Users/you/project/.worktree/feature-x",
          label: "feature-x",
          isCurrent: true,
        },
      ],
      33,
      "/other/repository",
    );

    expect(line).toBe("└─ • feature-x …orktree/feature-x");
    expect(visibleWidth(line)).toBeLessThanOrEqual(33);
  });

  it("hides when no path character can fit after the label", () => {
    const theme = createTheme();
    const worktrees = [
      { path: "/repo", label: "main", isCurrent: false },
      { path: "/repo/feature", label: "feature-x", isCurrent: true },
    ];

    expect(renderWorktreeLines(theme as never, worktrees, 16, "/repo")).toEqual(
      [],
    );
  });

  it("renders when one path character fits after the ellipsis", () => {
    const theme = createTheme();
    const worktrees = [
      { path: "/repo", label: "main", isCurrent: false },
      { path: "/repo/feature", label: "feature-x", isCurrent: true },
    ];

    expect(renderWorktreeLines(theme as never, worktrees, 17, "/repo")).toEqual(
      ["● Worktrees (2)", "└─ • feature-x …e"],
    );
  });

  it("hides when fewer than two worktrees are visible", () => {
    const theme = createTheme();

    expect(
      renderWorktreeLines(
        theme as never,
        [{ path: "/repo", label: "main", isCurrent: true }],
        120,
        "/repo",
      ),
    ).toEqual([]);
  });

  it("hides when Current Worktree cannot be uniquely resolved", () => {
    const theme = createTheme();

    expect(
      renderWorktreeLines(
        theme as never,
        [
          { path: "/repo", label: "main", isCurrent: false },
          { path: "/repo/feature", label: "feature-x", isCurrent: false },
        ],
        120,
        "/repo",
      ),
    ).toEqual([]);
    expect(
      renderWorktreeLines(
        theme as never,
        [
          { path: "/repo", label: "main", isCurrent: true },
          { path: "/repo/feature", label: "feature-x", isCurrent: true },
        ],
        120,
        "/repo",
      ),
    ).toEqual([]);
  });

  it("keeps every rendered row width-safe", () => {
    const theme = createTheme();
    const worktrees = [
      { path: "/Users/you/project", label: "main", isCurrent: false },
      {
        path: "/Users/you/project/.worktree/current",
        label: "current",
        isCurrent: true,
      },
    ];

    for (const width of [0, 5, 120]) {
      expect(
        renderWorktreeLines(
          theme as never,
          worktrees,
          width,
          "/other/repository",
        ).every((line) => visibleWidth(line) <= width),
      ).toBe(true);
    }
  });
});
