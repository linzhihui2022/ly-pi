import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { resolveExtDir } from "../src/shared/ext-dir";
import { listCategories, playCategory } from "./player";
import type { SoundConfig } from "./types";

const EXT_DIR = resolveExtDir(import.meta);

const CONFIG_PATH = join(EXT_DIR, "my-sound.json");

function resolveSoundDir(config: SoundConfig): string {
  const pack = config.packs[config.activePack];
  if (!pack) return resolve(EXT_DIR, "sounds");
  return resolve(EXT_DIR, pack.soundDir);
}

function loadConfig(): SoundConfig {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as SoundConfig;
  return config;
}

function saveConfig(config: SoundConfig): void {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export default function mySound(pi: ExtensionAPI): void {
  let config: SoundConfig;
  let soundDir: string;
  let lastPlayedCategory: string | undefined;
  try {
    config = loadConfig();
    soundDir = resolveSoundDir(config);
  } catch {
    // Config not found or invalid - extension won't play sounds
    return;
  }

  // ── Event-driven playback ──

  const VALID_EVENTS = new Set([
    "session_start",
    "session_shutdown",
    "agent_start",
    "agent_end",
    "turn_start",
    "turn_end",
    "tool_result",
  ]);

  for (const [eventName, category] of Object.entries(config.eventMap)) {
    if (!VALID_EVENTS.has(eventName)) continue;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic event name validated against VALID_EVENTS above
    pi.on(eventName as any, (_event, ctx) => {
      if (!config.enabled) return;
      if (eventName === "agent_end" && lastPlayedCategory === "question") {
        lastPlayedCategory = undefined;
        return;
      }
      lastPlayedCategory = category;
      playCategory(config, soundDir, category, ctx.ui.notify);
    });
  }

  // ── Tool-driven playback ──

  if (config.toolEventMap) {
    pi.on("tool_call", (event, ctx) => {
      if (!config.enabled) return;
      const category = config.toolEventMap?.[event.toolName];
      if (!category) return;
      lastPlayedCategory = category;
      playCategory(config, soundDir, category, ctx.ui.notify);
    });
  }

  // ── Permission event-driven playback ──

  if (config.permissionEventMap) {
    pi.events?.on("permissions:ui_prompt", () => {
      if (!config.enabled) return;
      const category = config.permissionEventMap?.["permissions:ui_prompt"];
      if (!category) return;
      // EventBus handlers don't receive a UI context, so errors are silent.
      lastPlayedCategory = category;
      playCategory(config, soundDir, category);
    });
  }

  // ── /sound command ──

  pi.registerCommand("sound", {
    description: "Sound pack — list, play, toggle sounds, or switch packs",
    handler: async (args: string | undefined, ctx: ExtensionContext) => {
      // Reload config in case it was updated
      try {
        config = loadConfig();
        soundDir = resolveSoundDir(config);
      } catch {
        ctx.ui.notify("Sound: Config not found or invalid", "error");
        return;
      }

      if (!args) {
        // List categories and packs
        const cats = listCategories(config);
        const _packNames = Object.keys(config.packs);
        const lines = [`🎙️  Sound — ${config.activePack}`];
        for (const cat of cats) {
          lines.push(`  /sound ${cat.name}  —  ${cat.description}`);
        }
        lines.push("  /sound all  —  播放全部");
        lines.push("  /sound packs  —  列出语音包");
        lines.push(`  /sound on  —  开启 (${config.enabled ? "当前" : ""})`);
        lines.push(`  /sound off  —  关闭 (${!config.enabled ? "当前" : ""})`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (args === "on") {
        config.enabled = true;
        saveConfig(config);
        ctx.ui.notify("🎙️  Sound: 已开启", "info");
        return;
      }

      if (args === "off") {
        config.enabled = false;
        saveConfig(config);
        ctx.ui.notify("🎙️  Sound: 已关闭", "info");
        return;
      }

      if (args === "packs") {
        const packNames = Object.keys(config.packs);
        const lines = ["🎙️  Voice Packs"];
        for (const name of packNames) {
          const marker = name === config.activePack ? "  ◀ 当前" : "";
          lines.push(`  /sound pack ${name}${marker}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (args.startsWith("pack ")) {
        const packName = args.slice(5).trim();
        if (!packName) {
          ctx.ui.notify("Sound: 用法 — /sound pack <name>", "warning");
          return;
        }
        if (!config.packs[packName]) {
          ctx.ui.notify(
            `Sound: 未知语音包 "${packName}"。用 /sound packs 查看可用语音包。`,
            "warning",
          );
          return;
        }
        config.activePack = packName;
        soundDir = resolveSoundDir(config);
        saveConfig(config);
        ctx.ui.notify(`🎙️  Sound: 已切换到 ${packName}`, "info");
        return;
      }

      if (args === "all") {
        if (!config.enabled) {
          ctx.ui.notify("🎙️  Sound: 已关闭，用 /sound on 开启", "warning");
          return;
        }
        // Play all categories sequentially (fire-and-forget, non-blocking)
        const cats = listCategories(config);
        ctx.ui.notify(`🎙️  Sound: 播放全部 (${cats.length} 分类)`, "info");
        let i = 0;
        function playNext(): void {
          if (i >= cats.length) return;
          playCategory(config, soundDir, cats[i].name, ctx.ui.notify);
          i++;
          setTimeout(playNext, 1500);
        }
        playNext();
        return;
      }

      // Play specific category
      if (!config.enabled) {
        ctx.ui.notify("🎙️  Sound: 已关闭，用 /sound on 开启", "warning");
        return;
      }

      if (config.categories[args]) {
        playCategory(config, soundDir, args, ctx.ui.notify);
        ctx.ui.notify(
          `🎙️  Sound: ${config.categories[args].description}`,
          "info",
        );
      } else {
        ctx.ui.notify(
          `Sound: 未知分类 "${args}"。用 /sound 查看可用分类。`,
          "warning",
        );
      }
    },
  });
}
