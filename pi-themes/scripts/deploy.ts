import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/themes");
await mkdir(dest, { recursive: true });

for (const f of await readdir(".")) {
  if (f.endsWith(".json") && f !== "package.json") {
    await Bun.write(join(dest, f), Bun.file(f));
  }
}
