import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/pi-pet");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
