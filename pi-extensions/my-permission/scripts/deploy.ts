import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/my-permission");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "config.json"), Bun.file("config.json"));
await Bun.write(join(dest, "judge-prompt.md"), Bun.file("judge-prompt.md"));
console.log("my-permission deployed to", dest);
