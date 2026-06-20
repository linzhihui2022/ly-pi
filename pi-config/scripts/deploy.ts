import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const configDest = join(homedir(), ".pi/agent/extensions/my-permission");
await mkdir(configDest, { recursive: true });
await Bun.write(join(configDest, "config.json"), Bun.file("my-permission.json"));

let dest = join(homedir(), ".pi/agent/extensions/pi-tool-display");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "config.json"), Bun.file("pi-tool-display.json"));
