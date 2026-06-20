import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

let piToolDisplayDest = join(homedir(), ".pi/agent/extensions/pi-tool-display");
await mkdir(piToolDisplayDest, { recursive: true });
await Bun.write(join(piToolDisplayDest, "config.json"), Bun.file("pi-tool-display.json"));

let piPermissionSystemDest = join(homedir(), ".pi/agent/extensions/pi-permission-system");
await mkdir(piPermissionSystemDest, { recursive: true });
await Bun.write(join(piPermissionSystemDest, "config.json"), Bun.file("pi-permission-system.json"));
