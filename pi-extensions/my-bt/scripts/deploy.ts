import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/my-bt");
const distDest = join(dest, "dist");
const soundsDest = join(dest, "sounds");
await mkdir(dest, { recursive: true });
await mkdir(distDest, { recursive: true });
await mkdir(soundsDest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "my-bt.json"), Bun.file("my-bt.json"));
await Bun.write(
  join(distDest, "mac-overlay.js"),
  Bun.file("dist/mac-overlay.js"),
);

for (const f of await readdir("sounds")) {
  await Bun.write(join(soundsDest, f), Bun.file(join("sounds", f)));
}
