import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const src = "skills";
const dest = join(homedir(), ".pi/agent/skills");

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
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
await copyDir(src, dest);
