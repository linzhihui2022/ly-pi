// Simulate mySound loading to check for errors
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Simulate the build-time EXT_DIR resolution
const EXT_DIR = dirname(fileURLToPath("file:///Users/lychee/.pi/agent/extensions/ly-pi/index.js"));
const CONFIG_PATH = join(EXT_DIR, "my-sound.json");

console.log("EXT_DIR:", EXT_DIR);
console.log("CONFIG_PATH:", CONFIG_PATH);
console.log("CONFIG exists:", existsSync(CONFIG_PATH));

try {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);
  console.log("Config parsed OK:", Object.keys(config));
  console.log("activePack:", config.activePack);
  console.log("packs keys:", Object.keys(config.packs));

  const pack = config.packs[config.activePack];
  console.log("pack:", pack);

  if (!pack) {
    const fallbackDir = resolve(EXT_DIR, "sounds");
    console.log("No pack found, fallback:", fallbackDir, "exists:", existsSync(fallbackDir));
  } else {
    const soundDir = resolve(EXT_DIR, pack.soundDir);
    console.log("soundDir:", soundDir, "exists:", existsSync(soundDir));
  }

  console.log("SUCCESS: Config loaded without errors");
} catch (e) {
  console.error("FAILED:", e.message);
  console.error(e.stack);
}
