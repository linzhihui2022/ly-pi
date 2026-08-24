import { describe, expect, it } from "vitest";
import { type Exec, type ExecResult, type RunDeps, run } from "./run";

interface HarnessOpts {
  revParse?: ExecResult;
  showRefCode?: number;
  addResult?: ExecResult;
  spawnCode?: number;
  exists?: boolean;
  env?: { PI_W_SPAWN?: string };
}

function harness(opts: HarnessOpts = {}) {
  const calls: string[][] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exec: Exec = async (argv) => {
    calls.push(argv);
    const cmd = argv.slice(0, 2).join(" ");
    if (cmd === "git rev-parse")
      return opts.revParse ?? { code: 0, stdout: "/repo\n" };
    if (cmd === "git show-ref")
      return { code: opts.showRefCode ?? 0, stdout: "" };
    if (cmd === "git worktree")
      return opts.addResult ?? { code: 0, stdout: "" };
    return { code: opts.spawnCode ?? 0, stdout: "pane-id-ignored" };
  };
  const deps: RunDeps = {
    exec,
    exists: () => opts.exists ?? false,
    env: opts.env ?? {},
    nextHash: () => "abc123",
    out: (s) => stdout.push(s),
    err: (s) => stderr.push(s),
  };
  return { calls, stdout, stderr, deps };
}

describe("run", () => {
  it("rejects wrong argument counts", async () => {
    const h = harness();
    expect(await run([], h.deps)).toBe(1);
    expect(await run(["a", "b"], h.deps)).toBe(1);
    expect(h.stderr).toEqual(["usage: pi-w <branch>", "usage: pi-w <branch>"]);
    expect(h.calls).toEqual([]);
  });

  it("fails outside a git repository", async () => {
    const h = harness({ revParse: { code: 128, stdout: "" } });
    expect(await run(["feat-x"], h.deps)).toBe(1);
    expect(h.stderr).toEqual(["pi-w: not inside a git repository"]);
    expect(h.stdout).toEqual([]);
  });

  it("creates the worktree and prints the dir (no launcher)", async () => {
    const h = harness({ showRefCode: 1 });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.calls).toEqual([
      ["git", "rev-parse", "--show-toplevel"],
      ["git", "show-ref", "--verify", "--quiet", "refs/heads/feat-x"],
      ["git", "worktree", "add", "-b", "feat-x", "/repo/.worktree/feat-x"],
    ]);
    expect(h.stdout).toEqual(["/repo/.worktree/feat-x"]);
  });

  it("forwards git's stdout to stderr", async () => {
    const h = harness({
      addResult: { code: 0, stdout: "HEAD is now at cb0141c\n" },
    });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.stderr).toEqual(["HEAD is now at cb0141c"]);
    expect(h.stdout).toEqual(["/repo/.worktree/feat-x"]);
  });

  it("stops without spawning when worktree add fails", async () => {
    const h = harness({
      addResult: { code: 1, stdout: "" },
      env: { PI_W_SPAWN: "launcher" },
    });
    expect(await run(["feat-x"], h.deps)).toBe(1);
    expect(h.calls.map((c) => c[0])).not.toContain("launcher");
    expect(h.stdout).toEqual([]);
  });

  it("spawns via $PI_W_SPAWN and still prints only the dir", async () => {
    const h = harness({ env: { PI_W_SPAWN: "wezterm cli spawn --cwd" } });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.calls.at(-1)).toEqual([
      "wezterm",
      "cli",
      "spawn",
      "--cwd",
      "/repo/.worktree/feat-x",
      "--",
      "/bin/zsh",
      "-ic",
      "pi; exec /bin/zsh",
    ]);
    expect(h.stdout).toEqual(["/repo/.worktree/feat-x"]);
  });

  it("reports spawn failure on stderr and returns 1", async () => {
    const h = harness({
      spawnCode: 1,
      env: { PI_W_SPAWN: "wezterm cli spawn --cwd" },
    });
    expect(await run(["feat-x"], h.deps)).toBe(1);
    expect(h.stderr).toEqual([
      "pi-w: spawn failed: wezterm cli spawn --cwd (worktree left at /repo/.worktree/feat-x)",
    ]);
    expect(h.stdout).toEqual([]);
  });

  it("treats blank $PI_W_SPAWN as unset", async () => {
    const h = harness({ env: { PI_W_SPAWN: "   " } });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.calls).toHaveLength(3);
    expect(h.stdout).toEqual(["/repo/.worktree/feat-x"]);
  });

  it("mints a hash branch from the original branch on dir conflict", async () => {
    const h = harness({ exists: true });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.calls.at(-1)).toEqual([
      "git",
      "worktree",
      "add",
      "-b",
      "feat-x-abc123",
      "/repo/.worktree/feat-x-abc123",
      "feat-x",
    ]);
    expect(h.stderr).toEqual(["pi-w: dir exists; using branch feat-x-abc123"]);
    expect(h.stdout).toEqual(["/repo/.worktree/feat-x-abc123"]);
  });

  it("mints a hash branch from HEAD when the original branch is missing", async () => {
    const h = harness({ exists: true, showRefCode: 1 });
    expect(await run(["feat-x"], h.deps)).toBe(0);
    expect(h.calls.at(-1)).toEqual([
      "git",
      "worktree",
      "add",
      "-b",
      "feat-x-abc123",
      "/repo/.worktree/feat-x-abc123",
    ]);
  });
});
