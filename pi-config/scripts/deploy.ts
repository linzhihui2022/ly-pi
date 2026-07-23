import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

let piToolDisplayDest = join(homedir(), ".pi/agent/extensions/pi-tool-display");
await mkdir(piToolDisplayDest, { recursive: true });
await Bun.write(join(piToolDisplayDest, "config.json"), Bun.file("pi-tool-display.json"));

let piPermissionSystemDest = join(homedir(), ".pi/agent/extensions/pi-permission-system");
await mkdir(piPermissionSystemDest, { recursive: true });
await Bun.write(join(piPermissionSystemDest, "config.json"), Bun.file("pi-permission-system.json"));

// pi-subagents: split runtime config and settings subagents key
const piSubagents = await Bun.file("pi-subagents.json").json();

// 1) runtime → ~/.pi/agent/extensions/subagent/config.json
const subagentDir = join(homedir(), ".pi/agent/extensions/subagent");
await mkdir(subagentDir, { recursive: true });
await Bun.write(
  join(subagentDir, "config.json"),
  JSON.stringify(piSubagents.runtime, null, 2) + "\n"
);

// 2) subagents → ~/.pi/agent/settings.json (merge, preserving other keys)
const settingsPath = join(homedir(), ".pi/agent/settings.json");
const settings = await Bun.file(settingsPath).json();
settings.subagents = piSubagents.subagents;
await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + "\n");

// pi-goal: config → ~/.pi/agent/pi-goal.json
await Bun.write(join(homedir(), ".pi/agent/pi-goal.json"), Bun.file("pi-goal.json"));

// rtk: install/refresh the Pi extension (skipped if rtk is not installed)
if (Bun.which("rtk")) {
  Bun.spawnSync(["rtk", "init", "-g", "--agent", "pi"]);
} else {
  console.log("rtk not found in PATH, skipping rtk init");
}
