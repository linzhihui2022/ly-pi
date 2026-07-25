import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/my-html");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "my-html.json"), Bun.file("my-html.json"));
