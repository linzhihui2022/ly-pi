import { mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/agents");

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (
      entry.name === "package.json" ||
      entry.name === "scripts" ||
      entry.name === "node_modules" ||
      entry.name === ".gitkeep"
    )
      continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}

await rm(dest, { recursive: true, force: true });
await copyDir(".", dest);
