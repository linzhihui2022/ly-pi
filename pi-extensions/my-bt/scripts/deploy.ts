import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/my-bt");
const soundsDest = join(dest, "sounds");
await mkdir(dest, { recursive: true });
await mkdir(soundsDest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "my-bt.json"), Bun.file("my-bt.json"));

for (const f of await readdir("sounds")) {
  await Bun.write(join(soundsDest, f), Bun.file(join("sounds", f)));
}
