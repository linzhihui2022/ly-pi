import { cpSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent/extensions/ly-pi");
await mkdir(dest, { recursive: true });

// Main bundle
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));

// Static assets — flattened at extension root so EXT_DIR resolution works
if (existsSync("my-bt/my-bt.json")) {
  await Bun.write(join(dest, "my-bt.json"), Bun.file("my-bt/my-bt.json"));
}
if (existsSync("my-back/my-back.json")) {
  await Bun.write(join(dest, "my-back.json"), Bun.file("my-back/my-back.json"));
}
if (existsSync("my-bt/sounds")) {
  cpSync("my-bt/sounds", join(dest, "sounds"), { recursive: true });
}
// my-permission static files
if (existsSync("my-permission/config.json")) {
  await Bun.write(
    join(dest, "config.json"),
    Bun.file("my-permission/config.json"),
  );
}
if (existsSync("my-permission/judge-prompt.md")) {
  await Bun.write(
    join(dest, "judge-prompt.md"),
    Bun.file("my-permission/judge-prompt.md"),
  );
}
console.log("ly-pi deployed to", dest);
