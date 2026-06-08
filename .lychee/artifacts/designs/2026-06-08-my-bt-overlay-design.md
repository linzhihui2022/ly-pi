# my-bt Overlay Notification Design

**Date**: 2026-06-08
**Status**: Approved

## Overview

Add a visual overlay popup to my-bt, displayed alongside voice playback when pi events
fire. The overlay uses a simplified peon-ping HUD style — dark tech panel with type
label, glowing border, title, subtitle, and a gradient accent bar.

## Visual Style

- Dark panel (`#0a0c16` background) with subtle glowing border
- Top: uppercase type label (e.g. "SESSION START") in accent color
- Middle: main title text (e.g. "BT-7274 已上线")
- Bottom: optional subtitle + horizontal gradient bar in accent color
- Position: screen top-right, slots stack downward
- Duration: 3 seconds auto-dismiss with fade-in / fade-out animation
- Color mapping per event semantic:

| Event | Color |
|-------|-------|
| `session_start` | blue |
| `agent_start` | orange |
| `agent_end` | green |
| future events | blue (default) |

## Triggering

- Overlay triggers **only** on pi events (`session_start`, `agent_start`, `agent_end`, etc.)
- Manual `/bt <category>` playback does **not** trigger overlay
- Toggle: shared with sound via `/bt on` / `/bt off` — no independent control
- When disabled, neither sound nor overlay fires

## Concurrency

- **Sound**: new event interrupts current playback (natural `afplay` behavior)
- **Overlay**: vertical stacking via slot system. Each overlay is an independent
  `osascript` process with its own NSWindow. New overlays appear below existing ones,
  each fading out on its own timer.

```
┌─────────────────────┐  ← slot 0
│  MISSION            │
│  执行任务中          │
└─────────────────────┘
        ↓ 5px gap
┌─────────────────────┐  ← slot 1
│  COMPLETE           │
│  任务完成            │
└─────────────────────┘
```

- Slots cycle 0–4. Slot assignment is managed by `player.ts`.
- Each overlay process is fully independent — no IPC, no Distributed Notification coordination.

## Implementation

### Files

| File | Change |
|------|--------|
| `types.ts` | Add `OverlayTextConfig`, `OverlayColor` types; extend `BtConfig` with `overlayTextMap` |
| `my-bt.json` | Add `overlayTextMap` field |
| `player.ts` | Add `playOverlay(eventName, config)` function + slot counter |
| `index.ts` | Call `playOverlay` alongside `playCategory` in event handlers |
| `scripts/mac-overlay.ts` | New — JXA overlay script (TS source, compiled to JS) |
| `player.test.ts` | Add overlay tests |
| `index.test.ts` | Add overlay trigger tests |

### TypeScript → JXA compilation

- Source: `scripts/mac-overlay.ts` — written in TypeScript with type annotations
- Build target: `dist/mac-overlay.js` — plain JavaScript for `osascript -l JavaScript`
- JXA constraints: no `import`/`export`, no arrow functions, no `async`/`await`, no modern ES features
- Type annotations are for dev-time checking only; stripped during build

### Config schema (`my-bt.json` addition)

```json
{
  "overlayTextMap": {
    "session_start": {
      "type": "SESSION START",
      "title": "BT-7274 已上线",
      "subtitle": "主要系统重启完成"
    },
    "agent_start": {
      "type": "MISSION",
      "title": "执行任务中",
      "subtitle": "将控制转给铁御"
    },
    "agent_end": {
      "type": "COMPLETE",
      "title": "任务完成",
      "subtitle": "做得好，铁御"
    }
  }
}
```

### Types (types.ts additions)

```ts
export interface OverlayTextConfig {
  type: string;       // Uppercase label, e.g. "SESSION START"
  title: string;      // Main title text
  subtitle?: string;  // Optional subtitle
}

export type OverlayColor = "blue" | "orange" | "green" | "red";

// BtConfig extension:
export interface BtConfig {
  // ... existing fields ...
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
```

### JXA script interface

```bash
osascript -l JavaScript dist/mac-overlay.js \
  "<type>" "<title>" "<subtitle>" <duration> <color> <slot>
```

| Arg | Type | Example | Description |
|-----|------|---------|-------------|
| argv[0] | string | `MISSION` | Type label (uppercase) |
| argv[1] | string | `执行任务中` | Main title |
| argv[2] | string | `将控制转给铁御` | Subtitle (empty string if none) |
| argv[3] | number | `3` | Duration in seconds |
| argv[4] | string | `orange` | Color key |
| argv[5] | number | `0` | Slot index for vertical stacking |

### player.ts — playOverlay

```ts
// Slot counter: 0-4, wraps around
let overlaySlot = 0;

const MAX_OVERLAY_SLOTS = 5;

export function playOverlay(
  config: BtConfig,
  eventName: string,
  extDir: string,       // resolved extension directory for script path
): void {
  // No-op when overlay config is absent entirely
  if (!config.overlayTextMap) return;

  const textConfig = config.overlayTextMap[eventName];
  if (!textConfig) return;

  const color = EVENT_COLOR_MAP[eventName] ?? "blue";
  const duration = 3;
  const slot = overlaySlot % MAX_OVERLAY_SLOTS;
  overlaySlot++;

  const scriptPath = resolve(extDir, "dist", "mac-overlay.js");
  exec(
    `osascript -l JavaScript "${scriptPath}" ` +
      `"${textConfig.type}" "${textConfig.title}" "${textConfig.subtitle ?? ""}" ` +
      `${duration} "${color}" ${slot}`
  );
}
```

### index.ts — event handler changes

```ts
pi.on(eventName as any, () => {
  if (!config.enabled) return;
  playCategory(config, category);
  playOverlay(config, eventName, EXT_DIR);  // added
});
```

## Testing

- **player.test.ts**: verify `playOverlay` constructs correct `osascript` command with
  proper argument formatting, slot rotation, and handles missing `overlayTextMap` entries
  gracefully.
- **index.test.ts**: verify event handlers call both `playCategory` and `playOverlay`;
  verify disabled state suppresses both; verify `/bt` manual playback does NOT call `playOverlay`.
- **JXA script**: manual testing on macOS (GUI scripts are not automatable).
- **Coverage target**: 100% (branches/functions/lines/statements) for all `.ts` files
  excluding `types.ts`, `index.ts` (integration), and `scripts/mac-overlay.ts` (JXA).

## Scope / Non-Goals

- ✅ Visual overlay on event-triggered sound playback
- ✅ Configurable text per event in `my-bt.json`
- ✅ Vertical slot stacking for concurrent overlays
- ✅ Shared on/off toggle with sound
- ❌ No overlay on manual `/bt` playback
- ❌ No independent overlay toggle
- ❌ No interactive elements (click to dismiss, buttons, etc.)
- ❌ No sound on overlay or overlay on sound — they are parallel but independent
- ❌ No Windows/Linux support (macOS only, JXA)
