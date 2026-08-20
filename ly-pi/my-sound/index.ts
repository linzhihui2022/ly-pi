import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { listCategories, playCategory } from "./player";
import type { SoundConfig, SoundPack } from "./types";

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions", "ly-pi");

const CONFIG_PATH = join(EXT_DIR, "my-sound.json");

// Sound packs live outside the repo/extension dir — users provide their own.
const SOUND_ROOT = join(homedir(), ".ly-pi", "sound");

export function resolveSoundDir(
  config: Pick<SoundConfig, "activePack" | "packs">,
): string {
  const pack = config.packs[config.activePack];
  if (!pack) return SOUND_ROOT;
  return resolve(SOUND_ROOT, pack.soundDir);
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
  // Always register /sound command — even if config fails, make it visible
  pi.registerCommand("sound", {
    description: "音效反馈 — 播放/开关/切换语音包",
    handler: async (args: string | undefined, ctx: ExtensionContext) => {
      // Reload config in case it was updated
      let config: SoundConfig;
      let soundDir: string;
      let pack: SoundPack;
      try {
        config = loadConfig();
        soundDir = resolveSoundDir(config);
        const activePack = config.packs[config.activePack];
        if (!activePack) {
          ctx.ui.notify(
            `Sound: 语音包 "${config.activePack}" 未在 packs 中定义`,
            "error",
          );
          return;
        }
        pack = activePack;
      } catch (e) {
        ctx.ui.notify(
          `Sound: Config error — ${e instanceof Error ? e.message : String(e)}`,
          "error",
        );
        return;
      }

      if (!args) {
        const cats = listCategories(pack);
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
        const cats = listCategories(pack);
        ctx.ui.notify(`🎙️  Sound: 播放全部 (${cats.length} 分类)`, "info");
        let i = 0;
        function playNext(): void {
          if (i >= cats.length) return;
          playCategory(pack, soundDir, cats[i].name, ctx.ui.notify);
          i++;
          setTimeout(playNext, 1500);
        }
        playNext();
        return;
      }

      if (!config.enabled) {
        ctx.ui.notify("🎙️  Sound: 已关闭，用 /sound on 开启", "warning");
        return;
      }

      if (pack.categories[args]) {
        playCategory(pack, soundDir, args, ctx.ui.notify);
        ctx.ui.notify(`🎙️  Sound: ${pack.categories[args].description}`, "info");
      } else {
        ctx.ui.notify(
          `Sound: 未知分类 "${args}"。用 /sound 查看可用分类。`,
          "warning",
        );
      }
    },
  });

  // Attempt to load config for event-driven playback.
  // Failures here are non-fatal — /sound command is already registered.
  let config: SoundConfig;
  let soundDir: string;
  let pack: SoundPack;
  try {
    config = loadConfig();
    soundDir = resolveSoundDir(config);
    const activePack = config.packs[config.activePack];
    // activePack missing from packs — events won't play sounds
    if (!activePack) return;
    pack = activePack;
  } catch {
    // Config not found or invalid — events won't play sounds
    return;
  }

  let lastPlayedCategory: string | undefined;

  const createEventHandler =
    (eventName: string, category: string) =>
    (_event: unknown, ctx: ExtensionContext) => {
      if (!config.enabled) return;
      if (eventName === "agent_end" && lastPlayedCategory === "question") {
        lastPlayedCategory = undefined;
        return;
      }
      lastPlayedCategory = category;
      playCategory(pack, soundDir, category, ctx.ui.notify);
    };

  for (const [eventName, category] of Object.entries(config.eventMap)) {
    const handler = createEventHandler(eventName, category);
    switch (eventName) {
      case "session_start":
        pi.on("session_start", handler);
        break;
      case "session_shutdown":
        pi.on("session_shutdown", handler);
        break;
      case "agent_start":
        pi.on("agent_start", handler);
        break;
      case "agent_end":
        pi.on("agent_end", handler);
        break;
      case "turn_start":
        pi.on("turn_start", handler);
        break;
      case "turn_end":
        pi.on("turn_end", handler);
        break;
      case "tool_result":
        pi.on("tool_result", handler);
        break;
    }
  }

  if (config.toolEventMap) {
    pi.on("tool_call", (event, ctx) => {
      if (!config.enabled) return;
      const category = config.toolEventMap?.[event.toolName];
      if (!category) return;
      lastPlayedCategory = category;
      playCategory(pack, soundDir, category, ctx.ui.notify);
    });
  }

  if (config.permissionEventMap) {
    try {
      pi.events?.on("permissions:ui_prompt", () => {
        if (!config.enabled) return;
        const category = config.permissionEventMap?.["permissions:ui_prompt"];
        if (!category) return;
        lastPlayedCategory = category;
        playCategory(pack, soundDir, category);
      });
    } catch {
      // EventBus may not support this event — non-fatal
    }
  }
}
