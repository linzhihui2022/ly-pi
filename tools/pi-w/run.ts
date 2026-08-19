import { planWorktree, slugify } from "./plan";

export interface ExecResult {
  code: number;
  /** Captured stdout. Callers decide whether to forward it (git) or drop it (spawn). */
  stdout: string;
}

export type Exec = (argv: string[]) => Promise<ExecResult>;

export interface RunDeps {
  exec: Exec;
  exists: (path: string) => boolean;
  env: { PI_W_SPAWN?: string };
  nextHash: () => string;
  /** stdout writer — reserved for the worktree dir, so `cd $(pi-w x)` works. */
  out: (s: string) => void;
  /** stderr writer — all diagnostics. */
  err: (s: string) => void;
}

export async function run(args: string[], deps: RunDeps): Promise<number> {
  if (args.length !== 1) {
    deps.err("usage: pi-w <branch>");
    return 1;
  }
  const rev = await deps.exec(["git", "rev-parse", "--show-toplevel"]);
  if (rev.code !== 0) {
    deps.err("pi-w: not inside a git repository");
    return 1;
  }
  const root = rev.stdout.trim();
  const branch = args[0];
  const dirExists = deps.exists(`${root}/.worktree/${slugify(branch)}`);
  const branchExists =
    (
      await deps.exec([
        "git",
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
      ])
    ).code === 0;

  const plan = planWorktree({
    branch,
    root,
    dirExists,
    branchExists,
    spawnPrefix: deps.env.PI_W_SPAWN?.trim() || undefined,
    nextHash: deps.nextHash,
  });
  for (const notice of plan.notices) {
    deps.err(notice);
  }

  // git's informational output goes to stderr (the zsh version's `1>&2`).
  const add = await deps.exec(["git", "worktree", "add", ...plan.gitArgv]);
  if (add.stdout.trim()) {
    deps.err(add.stdout.trimEnd());
  }
  if (add.code !== 0) {
    return 1;
  }

  if (plan.spawnArgv !== null) {
    const spawned = await deps.exec(plan.spawnArgv);
    if (spawned.code !== 0) {
      deps.err(
        `pi-w: spawn failed: ${deps.env.PI_W_SPAWN} (worktree left at ${plan.dir})`,
      );
      return 1;
    }
  }

  deps.out(plan.dir);
  return 0;
}
