import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/ly-pi");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
console.log("ly-pi deployed to", dest);
