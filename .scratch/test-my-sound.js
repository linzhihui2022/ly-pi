// Quick check: resolve EXT_DIR and verify config loads
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = "file:///Users/lychee/.pi/agent/extensions/ly-pi/index.js";
const EXT_DIR = dirname(fileURLToPath(url));
const CONFIG_PATH = join(EXT_DIR, "my-sound.json");

console.log("EXT_DIR:", EXT_DIR);
console.log("CONFIG_PATH:", CONFIG_PATH);

try {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);
  console.log("Config loaded OK");
  console.log("enabled:", config.enabled);
  console.log("activePack:", config.activePack);
  
  const pack = config.packs[config.activePack];
  const soundDir = pack ? join(EXT_DIR, pack.soundDir) : join(EXT_DIR, "sounds");
  console.log("soundDir:", soundDir);
  
  // Check if sound dir exists
  const { existsSync } = await import("node:fs");
  console.log("soundDir exists:", existsSync(soundDir));
  
  // List files
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(soundDir);
  console.log("Files:", files.length);
  
} catch (e) {
  console.error("ERROR:", e.message);
}
