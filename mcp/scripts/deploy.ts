import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const dest = join(homedir(), ".pi/agent");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "mcp.json"), Bun.file("mcp.json"));
