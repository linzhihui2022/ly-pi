import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listCategories, playCategory } from "./player";
import type { BtConfig } from "./types";

// Resolve extension directory — prefer __dirname, fall back to CWD-relative
const EXT_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { /* not ESM */ }
  return process.cwd();
})();

const CONFIG_PATH = join(EXT_DIR, "my-bt.json");

function loadConfig(): BtConfig {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as BtConfig;
  return { ...config, soundDir: resolve(EXT_DIR, config.soundDir) };
}

function saveConfig(config: BtConfig): void {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const existing = JSON.parse(raw) as BtConfig;
  const payload = { ...existing, enabled: config.enabled };
  writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

export default function myBt(pi: ExtensionAPI): void {
  let config: BtConfig;
  try {
    config = loadConfig();
  } catch {
    // Config not found or invalid - extension won't play sounds
    return;
  }

  // ── Event-driven playback ──

  const VALID_EVENTS = new Set([
    "session_start", "session_shutdown", "agent_start", "agent_end",
    "turn_start", "turn_end", "tool_call", "tool_result",
  ]);

  for (const [eventName, category] of Object.entries(config.eventMap)) {
    if (!VALID_EVENTS.has(eventName)) continue;
    pi.on(eventName as any, () => {
      if (!config.enabled) return;
      playCategory(config, category);
    });
  }

  // ── /bt command ──

  pi.registerCommand("bt", {
    description: "BT-7274 voice pack — list, play, or toggle sounds",
    handler: async (args: string | undefined, ctx: ExtensionContext) => {
      // Reload config in case it was updated
      try {
        config = loadConfig();
      } catch {
        ctx.ui.notify("BT-7274: Config not found or invalid", "error");
        return;
      }

      if (!args) {
        // List categories
        const cats = listCategories(config);
        const lines = ["🎙️  BT-7274 Voice Pack"];
        for (const cat of cats) {
          lines.push(`  /bt ${cat.name}  —  ${cat.description}`);
        }
        lines.push("  /bt all  —  播放全部");
        lines.push(`  /bt on  —  开启 (${config.enabled ? "当前" : ""})`);
        lines.push(`  /bt off  —  关闭 (${!config.enabled ? "当前" : ""})`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (args === "on") {
        config.enabled = true;
        saveConfig(config);
        ctx.ui.notify("🎙️  BT-7274: 已开启", "info");
        return;
      }

      if (args === "off") {
        config.enabled = false;
        saveConfig(config);
        ctx.ui.notify("🎙️  BT-7274: 已关闭", "info");
        return;
      }

      if (args === "all") {
        if (!config.enabled) {
          ctx.ui.notify("🎙️  BT-7274: 已关闭，用 /bt on 开启", "warn");
          return;
        }
        // Play all categories sequentially (fire-and-forget, non-blocking)
        const cats = listCategories(config);
        ctx.ui.notify(`🎙️  BT-7274: 播放全部 (${cats.length} 分类)`, "info");
        let i = 0;
        function playNext(): void {
          if (i >= cats.length) return;
          playCategory(config, cats[i].name);
          i++;
          setTimeout(playNext, 1500);
        }
        playNext();
        return;
      }

      // Play specific category
      if (!config.enabled) {
        ctx.ui.notify("🎙️  BT-7274: 已关闭，用 /bt on 开启", "warn");
        return;
      }

      if (config.categories[args]) {
        playCategory(config, args);
        ctx.ui.notify(
          `🎙️  BT-7274: ${config.categories[args].description}`,
          "info",
        );
      } else {
        ctx.ui.notify(
          `BT-7274: 未知分类 "${args}"。用 /bt 查看可用分类。`,
          "warn",
        );
      }
    },
  });
}
