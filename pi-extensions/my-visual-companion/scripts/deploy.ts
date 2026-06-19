import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/my-visual-companion");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "my-visual-companion.json"), Bun.file("my-visual-companion.json"));
await Bun.write(join(dest, "frame.html"), Bun.file("frame.html"));
await Bun.write(join(dest, "helper.js"), Bun.file("helper.js"));
