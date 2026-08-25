export interface PlanInput {
  branch: string;
  root: string;
  dirExists: boolean;
  branchExists: boolean;
  /** Value of $PI_W_SPAWN (launcher prefix); undefined/empty means no spawn. */
  spawnPrefix?: string;
  /** Short random hex suffix for name collisions, e.g. () => "abc123". */
  nextHash: () => string;
}

export interface Plan {
  /** Final branch name (may carry a hash suffix). */
  branch: string;
  /** Worktree directory. */
  dir: string;
  /** Arguments after `git worktree add`. */
  gitArgv: string[];
  /** Full spawn argv, or null when no launcher is configured. */
  spawnArgv: string[] | null;
  /** Diagnostic messages for stderr. */
  notices: string[];
}

export function slugify(branch: string): string {
  return branch.replaceAll("/", "-");
}

export function splitWords(s: string): string[] {
  return s.trim().split(/\s+/);
}

export function planWorktree(input: PlanInput): Plan {
  const { root, dirExists, branchExists, spawnPrefix, nextHash } = input;
  let { branch } = input;
  let dir = `${root}/.worktree/${slugify(branch)}`;
  const notices: string[] = [];
  let gitArgv: string[];

  if (dirExists) {
    // Dir taken: mint <branch>-<hash>, based on the original branch if it
    // exists, else on HEAD.
    const base = branchExists ? branch : "";
    branch = `${branch}-${nextHash()}`;
    dir = `${root}/.worktree/${slugify(branch)}`;
    notices.push(`pi-w: dir exists; using branch ${branch}`);
    gitArgv = base ? ["-b", branch, dir, base] : ["-b", branch, dir];
  } else if (branchExists) {
    gitArgv = [dir, branch];
  } else {
    gitArgv = ["-b", branch, dir];
  }

  const spawnArgv = spawnPrefix
    ? [
        ...splitWords(spawnPrefix),
        dir,
        "--",
        "/bin/zsh",
        "-ic",
        "pi; exec /bin/zsh",
      ]
    : null;

  return { branch, dir, gitArgv, spawnArgv, notices };
}
