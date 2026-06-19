import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

let dest = join(homedir(), ".pi/agent/extensions/pi-tool-display");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "config.json"), Bun.file("pi-tool-display.json"));
