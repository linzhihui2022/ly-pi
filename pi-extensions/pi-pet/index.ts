/**
 * pi-pet — a virtual ASCII cat for Pi.
 *
 * - Watches Pi events and reacts: tests passing = happy, failures = sad.
 * - `/pet` command: status, feed, play, sleep, rename.
 * - Optional notice when the cat needs attention.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PetStateManager } from "./state";
import { selectFrame, renderStatus } from "./art";
import { EVENT_IMPACTS } from "./events";
import { loadConfig, type PetConfig } from "./config";
import type { PetState } from "./types";

// ── Helpers ─────────────────────────────────────────────────────

function needsAttention(state: PetState): boolean {
  return state.hunger > 70 || state.mood < 30 || state.energy < 30;
}

function formatPetStatus(state: PetState): string {
  const frame = selectFrame(state);
  const status = renderStatus(state);
  return frame.join("\n") + "\n" + status.join("\n");
}

// ── Extension ───────────────────────────────────────────────────

export default function piPet(pi: ExtensionAPI): void {
  let config: PetConfig;
  let manager: PetStateManager;
  let lastNoticeMs = 0;

  function getAttentionMsg(state: PetState): string {
    const msgs: string[] = [];
    if (state.hunger > 70) msgs.push(`${state.name} is hungry! 🍽`);
    if (state.mood < 30) msgs.push(`${state.name} is sad! 😿`);
    if (state.energy < 30) msgs.push(`${state.name} is tired! 😴`);
    return msgs.join(" ");
  }

  function maybeNotify(ctx: ExtensionContext, state: PetState): void {
    if (!config?.notices.enabled) return;
    const now = Date.now();
    if (now - lastNoticeMs < config.notices.minIntervalMinutes * 60 * 1000) return;
    if (!needsAttention(state)) return;
    const msg = getAttentionMsg(state);
    if (msg) {
      ctx.ui.notify(msg, "info");
      lastNoticeMs = now;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    if (!config.enabled) return;

    manager = new PetStateManager();

    if (ctx.hasUI) {
      ctx.ui.setFooter((_tui) => ({
        render(): string[] {
          if (!manager) return [];
          const s = manager.getState();
          return needsAttention(s) ? [" 😺 " + s.name] : [" 😺"];
        },
        invalidate() {},
        dispose() {},
      }));
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!manager) return;
    manager.applyEventImpacts(EVENT_IMPACTS["positive-small"]);
    maybeNotify(ctx, manager.getState());
  });

  // ── Commands ───────────────────────────────────────────────────

  pi.registerCommand("pet", {
    description: "Interact with your virtual pet",
    getArgumentCompletions: (prefix) => {
      return ["status", "feed", "play", "sleep", "rename", "help"]
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },
    handler: async (args, ctx) => {
      if (!manager) {
        ctx.ui.notify(
          "Pet is not enabled. Set enabled: true in ~/.pi/pet-config.json",
          "error",
        );
        return;
      }

      const [cmd, ...rest] = args.trim().split(/\s+/);

      switch (cmd || "status") {
        case "status":
          ctx.ui.notify(
            `${manager.getState().name} (${manager.getState().stage})\n` +
              formatPetStatus(manager.getState()),
            "info",
          );
          break;

        case "feed":
          manager.feed();
          ctx.ui.notify(
            `${manager.getState().name} has been fed! 🍽\n` +
              renderStatus(manager.getState()).join("\n"),
            "info",
          );
          break;

        case "play":
          manager.play();
          ctx.ui.notify(
            `${manager.getState().name} is playing! 🧶\n` +
              renderStatus(manager.getState()).join("\n"),
            "info",
          );
          break;

        case "sleep":
          manager.sleep();
          ctx.ui.notify(
            `${manager.getState().name} is sleeping... 😴\n` +
              renderStatus(manager.getState()).join("\n"),
            "info",
          );
          break;

        case "rename": {
          const newName = rest.join(" ").trim();
          if (!newName) {
            ctx.ui.notify("Usage: /pet rename <name>", "info");
            return;
          }
          manager.rename(newName);
          ctx.ui.notify(`Pet renamed to ${newName}!`, "info");
          break;
        }

        default:
          ctx.ui.notify(
            "/pet status  — show pet state\n" +
              "/pet feed    — feed your pet\n" +
              "/pet play    — play with your pet\n" +
              "/pet sleep   — let your pet rest\n" +
              "/pet rename  — rename your pet",
            "info",
          );
          break;
      }
    },
  });
}
