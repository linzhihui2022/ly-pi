import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "mcp.json"), Bun.file("mcp.json"));
