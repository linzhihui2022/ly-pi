import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/my-hud");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
if (existsSync("my-hud.json")) {
  await Bun.write(join(dest, "my-hud.json"), Bun.file("my-hud.json"));
}
