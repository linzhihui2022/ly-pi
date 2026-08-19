import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { realExec } from "./exec";
import { run } from "./run";

const code = await run(process.argv.slice(2), {
  exec: realExec,
  exists: existsSync,
  env: { PI_W_SPAWN: process.env.PI_W_SPAWN },
  nextHash: () => randomBytes(3).toString("hex"),
  out: (s) => console.log(s),
  err: (s) => console.error(s),
});
process.exit(code);
