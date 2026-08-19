import { spawnSync } from "node:child_process";
import type { Exec } from "./run";

// Child stderr is inherited (shown live); stdout is captured so the caller can
// forward git's informational output to stderr while keeping our stdout clean.
// A missing executable (e.g. launcher not on $PATH) sets r.error instead of
// exiting — report 127 like a shell would, so callers get a clean failure.
export const realExec: Exec = async (argv) => {
  const [cmd, ...rest] = argv;
  const r = spawnSync(cmd, rest, { stdio: ["ignore", "pipe", "inherit"] });
  if (r.error) {
    console.error(`pi-w: ${r.error.message}`);
    return { code: 127, stdout: "" };
  }
  return { code: r.status ?? 1, stdout: r.stdout.toString() };
};
