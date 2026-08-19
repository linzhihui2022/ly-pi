import { describe, expect, it } from "vitest";
import { planWorktree, slugify, splitWords } from "./plan";

const hash = () => "abc123";
const base = { root: "/repo", nextHash: hash };

describe("slugify", () => {
  it("replaces slashes with dashes", () => {
    expect(slugify("feat/x/y")).toBe("feat-x-y");
  });

  it("leaves plain names untouched", () => {
    expect(slugify("main")).toBe("main");
  });
});

describe("splitWords", () => {
  it("splits on whitespace runs and trims", () => {
    expect(splitWords("  wezterm  cli spawn --cwd ")).toEqual([
      "wezterm",
      "cli",
      "spawn",
      "--cwd",
    ]);
  });
});

describe("planWorktree", () => {
  it("checks out the existing branch when the dir is free", () => {
    const p = planWorktree({
      ...base,
      branch: "feat-x",
      dirExists: false,
      branchExists: true,
    });
    expect(p.branch).toBe("feat-x");
    expect(p.dir).toBe("/repo/.worktree/feat-x");
    expect(p.gitArgv).toEqual(["/repo/.worktree/feat-x", "feat-x"]);
    expect(p.notices).toEqual([]);
  });

  it("creates a new branch from HEAD when the branch does not exist", () => {
    const p = planWorktree({
      ...base,
      branch: "feat-x",
      dirExists: false,
      branchExists: false,
    });
    expect(p.gitArgv).toEqual(["-b", "feat-x", "/repo/.worktree/feat-x"]);
  });

  it("mints a hash branch from the original branch when the dir is taken", () => {
    const p = planWorktree({
      ...base,
      branch: "feat-x",
      dirExists: true,
      branchExists: true,
    });
    expect(p.branch).toBe("feat-x-abc123");
    expect(p.dir).toBe("/repo/.worktree/feat-x-abc123");
    expect(p.gitArgv).toEqual([
      "-b",
      "feat-x-abc123",
      "/repo/.worktree/feat-x-abc123",
      "feat-x",
    ]);
    expect(p.notices).toEqual(["pi-w: dir exists; using branch feat-x-abc123"]);
  });

  it("mints a hash branch from HEAD when the dir is taken and the branch is missing", () => {
    const p = planWorktree({
      ...base,
      branch: "feat-x",
      dirExists: true,
      branchExists: false,
    });
    expect(p.gitArgv).toEqual([
      "-b",
      "feat-x-abc123",
      "/repo/.worktree/feat-x-abc123",
    ]);
  });

  it("slugifies slashes in both plain and hashed branch names", () => {
    const p = planWorktree({
      ...base,
      branch: "feat/x",
      dirExists: true,
      branchExists: true,
    });
    expect(p.branch).toBe("feat/x-abc123");
    expect(p.dir).toBe("/repo/.worktree/feat-x-abc123");
  });

  it("builds spawn argv from the prefix when set", () => {
    const p = planWorktree({
      ...base,
      branch: "b",
      dirExists: false,
      branchExists: false,
      spawnPrefix: "wezterm cli spawn --cwd",
    });
    expect(p.spawnArgv).toEqual([
      "wezterm",
      "cli",
      "spawn",
      "--cwd",
      "/repo/.worktree/b",
      "--",
      "/bin/zsh",
      "-c",
      "pi; exec /bin/zsh",
    ]);
  });

  it("has no spawn argv without a prefix", () => {
    const p = planWorktree({
      ...base,
      branch: "b",
      dirExists: false,
      branchExists: false,
    });
    expect(p.spawnArgv).toBeNull();
  });
});
