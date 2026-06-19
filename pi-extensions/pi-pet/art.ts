/**
 * ASCII cat art for pi-pet — 3-line compact frames.
 *
 * Five emotional states with distinct 3-line frames:
 *   - happy   (mood > 60 && energy > 40)
 *   - neutral (default)
 *   - hungry  (hunger > 70, overrides unless energy < 15)
 *   - tired   (energy < 15, takes priority over hungry)
 *   - sad     (mood < 30)
 *
 * Each frame is exactly 3 strings of equal visual width.
 */

import type { PetState } from "./types";

// ── 3-line frames ───────────────────────────────────────────────
// Line 1: ears + head top    Line 2: eyes + face    Line 3: mouth + body

const FRAMES: Record<string, string[]> = {
  happy: [
    "  /\\_/\\  ",
    " ( ^w^ ) ",
    "  > ^ <  ",
  ],

  neutral: [
    "  /\\_/\\  ",
    " ( -_- ) ",
    "  |   |  ",
  ],

  hungry: [
    "  /\\_/\\  ",
    " ( >_< ) ",
    "  o   o  ",
  ],

  sad: [
    "  /\\_/\\  ",
    " ( ;_; ) ",
    "  ~ ~ ~  ",
  ],

  tired: [
    "  /\\_/\\  ",
    " ( -.- ) ",
    "  z   z  ",
  ],
};

// ── Frame selection ─────────────────────────────────────────────

export function selectFrame(state: PetState): string[] {
  if (state.energy < 15) return FRAMES.tired;

  if (state.hunger > 70) return FRAMES.hungry;

  if (state.mood < 30) return FRAMES.sad;

  if (state.mood > 60 && state.energy > 40) return FRAMES.happy;

  return FRAMES.neutral;
}

// ── Status bar (compact for 3-line cat) ─────────────────────────

function bar(name: string, value: number, width = 10): string {
  const filled = Math.round((value / 100) * width);
  const barChars = "█".repeat(filled) + "░".repeat(width - filled);
  return ` ${name.padEnd(7)} ${barChars} ${String(Math.round(value)).padStart(3)}%`;
}

export function renderStatus(state: PetState, width = 40): string[] {
  const lines: string[] = [];
  lines.push(` ${state.name} (${state.stage})`);
  lines.push(bar("Hunger", state.hunger, width > 50 ? 15 : 10));
  lines.push(bar("Mood", state.mood, width > 50 ? 15 : 10));
  lines.push(bar("Energy", state.energy, width > 50 ? 15 : 10));
  return lines;
}
