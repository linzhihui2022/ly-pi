import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/agents");
await mkdir(dest, { recursive: true });

for (const entry of await readdir(".", { withFileTypes: true })) {
  if (
    entry.name === "package.json" ||
    entry.name === "scripts" ||
    entry.name === "node_modules" ||
    entry.name === ".gitkeep"
  )
    continue;
  const srcPath = join(".", entry.name);
  const destPath = join(dest, entry.name);
  if (entry.isDirectory()) {
    await mkdir(destPath, { recursive: true });
    for (const f of await readdir(srcPath)) {
      await Bun.write(join(destPath, f), Bun.file(join(srcPath, f)));
    }
  } else {
    await Bun.write(destPath, Bun.file(srcPath));
  }
}
