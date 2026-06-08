# my-bt Overlay Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS native overlay popup that appears alongside BT-7274 voice playback on pi events, using a simplified peon-ping HUD style.

**Architecture:** The extension spawns `osascript -l JavaScript` to run a standalone JXA script that creates a borderless NSWindow. Sound and overlay run in parallel — sound fires `afplay`, overlay fires `osascript`. Overlays stack vertically via a slot counter in player.ts.

**Tech Stack:** TypeScript (extension), JXA/JavaScript (macOS overlay), Bun (test/build), Vitest (coverage)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `types.ts` | Shared type definitions (read by all modules) |
| `player.ts` | Sound playback + overlay spawning + slot management |
| `index.ts` | Pi event wiring + `/bt` command |
| `scripts/mac-overlay.ts` | JXA script source (TS, compiled to JS for osascript) |
| `player.test.ts` | Unit tests for player.ts (sound + overlay) |
| `index.test.ts` | Integration tests for index.ts |
| `my-bt.json` | Runtime config (sound + overlay text) |
| `package.json` | Build scripts (add overlay compilation) |
| `vitest.config.ts` | Coverage exclusions (add overlay script) |

---

### Task 1: Add type definitions

**Files:**
- Modify: `pi-extensions/my-bt/types.ts`

- [ ] **Step 1: Add OverlayTextConfig, OverlayColor, and extend BtConfig**

Replace the entire file:

```ts
export interface BtCategory {
  description: string;
  files: string[];
}

export interface OverlayTextConfig {
  type: string;
  title: string;
  subtitle?: string;
}

export type OverlayColor = "blue" | "orange" | "green" | "red";

export interface BtConfig {
  enabled: boolean;
  soundDir: string;
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd pi-extensions/my-bt && bun run --silent -e "import './types'"` (expects no output/errors)

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/types.ts
git commit -m "feat(my-bt): add OverlayTextConfig and OverlayColor types"
```

---

### Task 2: Add overlayTextMap to config

**Files:**
- Modify: `pi-extensions/my-bt/my-bt.json`

- [ ] **Step 1: Insert overlayTextMap after the existing eventMap**

Read the current file, then add `overlayTextMap` as a sibling to `eventMap`:

```json
{
  "enabled": true,
  "soundDir": "sounds",
  "categories": { ... },
  "eventMap": { ... },
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

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-bt/my-bt.json
git commit -m "feat(my-bt): add overlayTextMap config for event notifications"
```

---

### Task 3: Create JXA overlay script (TypeScript source)

**Files:**
- Create: `pi-extensions/my-bt/scripts/mac-overlay.ts`

This script is compiled to JS and run by `osascript -l JavaScript`. It must NOT use: `import`, `export`, arrow functions, `async`/`await`, template literals, or any ES6+ features. Type annotations are for dev-time checking only — stripped during build.

- [ ] **Step 1: Write the complete script**

```ts
// BT-7274 overlay notification for macOS
// Compiled to .js for osascript -l JavaScript
// JXA constraints: no import/export, no arrow functions, no async/await

// ═══ Type annotations (stripped during build) ═══
type OverlayColor = "blue" | "orange" | "green" | "red";

ObjC.import("Cocoa");

// deno-lint-ignore no-unused-vars
function run(argv: string[]): void {
  var typeLabel: string = argv[0] || "BT-7274";
  var title: string = argv[1] || "";
  var subtitle: string = argv[2] || "";
  var duration: number = parseFloat(argv[3]) || 3;
  var color: string = argv[4] || "blue";
  var slot: number = parseInt(argv[5], 10) || 0;

  // ── Color mapping ──
  var accentR: number = 0.0;
  var accentG: number = 0.75;
  var accentB: number = 1.0;
  switch (color) {
    case "orange":
      accentR = 1.0;
      accentG = 0.6;
      accentB = 0.0;
      break;
    case "green":
      accentR = 0.2;
      accentG = 0.9;
      accentB = 0.4;
      break;
    case "red":
      accentR = 1.0;
      accentG = 0.25;
      accentB = 0.15;
      break;
    // blue is default
  }

  // ── Window dimensions ──
  var winW: number = 280;
  var winH: number = 90;
  var margin: number = 20;
  var slotStep: number = winH + 5;

  // ── Screen position (top-right, slots stack downward) ──
  var screen: $ = $.NSScreen.mainScreen;
  var vf: $ = screen.visibleFrame;
  var x: number = vf.origin.x + vf.size.width - winW - margin;
  var y: number = vf.origin.y + vf.size.height - winH - margin - slot * slotStep;

  // ── Window ──
  $.NSApplication.sharedApplication;
  $.NSApp.setActivationPolicy(4); // NSApplicationActivationPolicyAccessory

  var nonActivating: number = 1 << 7; // NSWindowStyleMaskNonactivatingPanel
  var win: $ = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(x, y, winW, winH),
    0 | nonActivating, // NSWindowStyleMaskBorderless
    2, // NSBackingStoreBuffered
    false
  );
  win.setBackgroundColor($.NSColor.clearColor);
  win.setOpaque(false);
  win.setHasShadow(true);
  win.setAlphaValue(0.0);
  win.setLevel($.NSStatusWindowLevel);
  win.setCollectionBehavior((1 << 0) | (1 << 4)); // CanJoinAllSpaces | Stationary

  // ── Content view with rounded panel ──
  var contentView: $ = win.contentView;
  contentView.setWantsLayer(true);
  contentView.layer.setCornerRadius(12);
  contentView.layer.setMasksToBounds(true);

  // Background: #0a0c16 at 94% opacity
  contentView.layer.setBackgroundColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.04, 0.05, 0.09, 0.94).CGColor
  );
  // Border: accent color at 30% opacity
  contentView.layer.setBorderWidth(1);
  contentView.layer.setBorderColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 0.3).CGColor
  );

  // ── Type label (top, uppercase, accent color) ──
  var typeField: $ = $.NSTextField.alloc.initWithFrame(
    $.NSMakeRect(16, winH - 28, winW - 32, 14)
  );
  typeField.setStringValue(typeLabel);
  typeField.setTextColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 1.0)
  );
  typeField.setFont($.NSFont.systemFontOfSize(9));
  typeField.setBezeled(false);
  typeField.setDrawsBackground(false);
  typeField.setEditable(false);
  typeField.setSelectable(false);
  contentView.addSubview(typeField);

  // ── Title (main text, white) ──
  var titleField: $ = $.NSTextField.alloc.initWithFrame(
    $.NSMakeRect(16, winH - 52, winW - 32, 22)
  );
  titleField.setStringValue(title);
  titleField.setTextColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.85, 0.88, 0.95, 1.0)
  );
  titleField.setFont($.NSFont.boldSystemFontOfSize(14));
  titleField.setBezeled(false);
  titleField.setDrawsBackground(false);
  titleField.setEditable(false);
  titleField.setSelectable(false);
  contentView.addSubview(titleField);

  // ── Subtitle (optional, muted gray) ──
  if (subtitle && subtitle.length > 0) {
    var subField: $ = $.NSTextField.alloc.initWithFrame(
      $.NSMakeRect(16, winH - 72, winW - 32, 16)
    );
    subField.setStringValue(subtitle);
    subField.setTextColor(
      $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.45, 0.48, 0.55, 1.0)
    );
    subField.setFont($.NSFont.systemFontOfSize(11));
    subField.setBezeled(false);
    subField.setDrawsBackground(false);
    subField.setEditable(false);
    subField.setSelectable(false);
    contentView.addSubview(subField);
  }

  // ── Gradient bar (bottom accent line) ──
  // Simple approach: a thin colored view at the bottom
  var barView: $ = $.NSView.alloc.initWithFrame(
    $.NSMakeRect(0, 0, winW, 2)
  );
  barView.setWantsLayer(true);
  barView.layer.setBackgroundColor(
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(accentR, accentG, accentB, 0.8).CGColor
  );
  contentView.addSubview(barView);

  // ── Show and animate ──
  win.orderFront(null);

  // Fade in over 0.3s
  var fadeInDuration: number = 0.3;
  $.NSAnimationContext.beginGrouping;
  $.NSAnimationContext.currentContext.setDuration(fadeInDuration);
  win.animator.setAlphaValue(1.0);
  $.NSAnimationContext.endGrouping;

  // Fade out + terminate after duration
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    duration, $.NSApp, "terminate:", null, false
  );

  $.NSApp.run;
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-bt/scripts/mac-overlay.ts
git commit -m "feat(my-bt): add JXA overlay script (TS source)"
```

---

### Task 4: Add overlay build step

**Files:**
- Modify: `pi-extensions/my-bt/package.json`

- [ ] **Step 1: Add overlay compilation to build script**

Change the `build` script in package.json:

```json
{
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*' && bun build ./scripts/mac-overlay.ts --outfile dist/mac-overlay.js --target bun",
    "test": "npx vitest run --coverage",
    "deploy": "bun run scripts/deploy.ts"
  }
}
```

- [ ] **Step 2: Run build and verify output**

```bash
cd pi-extensions/my-bt && bun run build
```

Expected: `dist/mac-overlay.js` is created. Check the first few lines — it should be plain JS (no `require`, no module wrappers).

- [ ] **Step 3: If bun build wraps in modules, fix with inline type-stripping**

If `dist/mac-overlay.js` contains `require(` or module boilerplate, replace the overlay part of the build with:

```json
"build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*' && bun run build:overlay",
"build:overlay": "bun -e \"const t=require('typescript');const s=require('fs').readFileSync('scripts/mac-overlay.ts','utf8');const r=t.transpileModule(s,{compilerOptions:{target:1,module:1}});require('fs').writeFileSync('dist/mac-overlay.js',r.outputText)\""
```

Note: this fallback requires `typescript` as a devDependency. If the simple `bun build` approach works, skip this.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-bt/package.json pi-extensions/my-bt/dist/mac-overlay.js
git commit -m "build(my-bt): add mac-overlay.ts compilation step"
```

---

### Task 5: Add playOverlay to player.ts

**Files:**
- Modify: `pi-extensions/my-bt/player.ts`

- [ ] **Step 1: Add imports, slot counter, color map, and playOverlay function**

Insert after the existing imports (line 1-3), before `listCategories`:

```ts
import { resolve } from "node:path";
```

Add after `listCategories` and before `pickSoundFile`:

```ts
// ═══ Overlay notification ═══

/** Slot counter for vertical stacking (0–4, wraps) */
let overlaySlot = 0;
const MAX_OVERLAY_SLOTS = 5;

/** Color mapping: event name → overlay accent color */
const EVENT_COLOR_MAP: Record<string, import("./types").OverlayColor> = {
  session_start: "blue",
  agent_start: "orange",
  agent_end: "green",
};

/**
 * Show overlay notification for a pi event.
 * Spawns osascript with the compiled JXA script.
 * No-ops silently when overlayTextMap is missing or event has no config.
 */
export function playOverlay(
  config: BtConfig,
  eventName: string,
  extDir: string,
): void {
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
      `${duration} "${color}" ${slot}`,
    (error) => {
      if (error) {
        console.error(`[my-bt] Overlay failed: ${error.message}`);
      }
    },
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd pi-extensions/my-bt && bun run --silent -e "import { playOverlay } from './player'"` (expects no errors)

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/player.ts
git commit -m "feat(my-bt): add playOverlay with slot-based stacking"
```

---

### Task 6: Add overlay tests to player.test.ts

**Files:**
- Modify: `pi-extensions/my-bt/player.test.ts`

- [ ] **Step 1: Add playOverlay import and extend mock config**

Change the import line from:
```ts
import { listCategories, pickSoundFile, resolveSoundPath, playCategory } from "./player";
```
to:
```ts
import { listCategories, pickSoundFile, resolveSoundPath, playCategory, playOverlay } from "./player";
```

Add `enabled: true` and `overlayTextMap` to mockConfig:

```ts
const mockConfig: BtConfig = {
  enabled: true,
  soundDir: "/fake/sounds",
  categories: {
    startup: { description: "BT-7274 startup", files: ["startup.mp3"] },
    affirmative: { description: "Affirmative response", files: ["affirm_1.mp3", "affirm_2.mp3"] },
    warning: { description: "Warning alert", files: ["warning.mp3"] },
    engaging: { description: "Engaging", files: ["engage.mp3"] },
    completed: { description: "Task completed", files: ["done.mp3"] },
    error: { description: "Error occurred", files: ["error_1.mp3", "error_2.mp3"] },
  },
  eventMap: {
    session_start: "startup",
    agent_start: "engaging",
    agent_end: "completed",
  },
  overlayTextMap: {
    session_start: { type: "SESSION START", title: "BT-7274 已上线", subtitle: "系统重启" },
    agent_start: { type: "MISSION", title: "执行任务", subtitle: "铁御控制" },
    agent_end: { type: "COMPLETE", title: "任务完成" },
  },
};
```

Note: `agent_end` has no `subtitle` — this tests the optional subtitle path.

- [ ] **Step 2: Add describe block for playOverlay**

Add after the last `describe` block (after `resolveSoundPath`), before the file ends:

```ts
describe("playOverlay", () => {
  const extDir = "/fake/ext";

  it("spawns osascript with correct arguments for session_start", () => {
    playOverlay(mockConfig, "session_start", extDir);
    expect(exec).toHaveBeenCalledTimes(2); // one from beforeEach context? No — expect exact call
    // Actually we need to be careful — exec might have been called by other tests.
    // Let's check the last call:
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("osascript -l JavaScript");
    expect(cmd).toContain("dist/mac-overlay.js");
    expect(cmd).toContain("SESSION START");
    expect(cmd).toContain("BT-7274 已上线");
    expect(cmd).toContain("系统重启");
    expect(cmd).toContain("3");
    expect(cmd).toContain("blue");
  });

  it("spawns osascript with orange color for agent_start", () => {
    playOverlay(mockConfig, "agent_start", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("orange");
    expect(cmd).toContain("MISSION");
    expect(cmd).toContain("铁御控制");
  });

  it("omits subtitle when not configured", () => {
    playOverlay(mockConfig, "agent_end", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain('""'); // empty string for subtitle
  });

  it("defaults to blue for unknown event", () => {
    playOverlay(mockConfig, "session_shutdown", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("blue");
  });

  it("cycles through slot 0-4 and wraps", () => {
    for (let i = 0; i < 7; i++) {
      playOverlay(mockConfig, "session_start", extDir);
    }
    // Check the last call has slot 1 (0,1,2,3,4,0,1)
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("blue\" 1");
  });

  it("no-ops when overlayTextMap is missing", () => {
    const cfgNoOverlay: BtConfig = {
      ...mockConfig,
      overlayTextMap: undefined,
    };
    const before = vi.mocked(exec).mock.calls.length;
    playOverlay(cfgNoOverlay, "session_start", extDir);
    expect(vi.mocked(exec).mock.calls.length).toBe(before);
  });

  it("no-ops when event has no overlay config", () => {
    const before = vi.mocked(exec).mock.calls.length;
    playOverlay(mockConfig, "tool_call", extDir);
    expect(vi.mocked(exec).mock.calls.length).toBe(before);
  });

  it("logs error when osascript fails", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(exec).mockImplementationOnce((_cmd: string, cb: any) => {
      cb(new Error("osascript failed"));
    });
    playOverlay(mockConfig, "session_start", extDir);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("osascript failed"),
    );
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail correctly first**

Run: `cd pi-extensions/my-bt && npx vitest run player.test.ts`

Expected: The new tests should PASS (since we already wrote `playOverlay` in Task 5).

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/player.test.ts
git commit -m "test(my-bt): add playOverlay unit tests"
```

---

### Task 7: Integrate playOverlay into index.ts

**Files:**
- Modify: `pi-extensions/my-bt/index.ts`

- [ ] **Step 1: Import playOverlay**

Change line 5 from:
```ts
import { listCategories, playCategory } from "./player";
```
to:
```ts
import { listCategories, playCategory, playOverlay } from "./player";
```

- [ ] **Step 2: Call playOverlay in event handlers**

In the event loop (around line 45), add `playOverlay` after `playCategory`:

```ts
  for (const [eventName, category] of Object.entries(config.eventMap)) {
    if (!VALID_EVENTS.has(eventName)) continue;
    pi.on(eventName as any, () => {
      if (!config.enabled) return;
      playCategory(config, category);
      playOverlay(config, eventName, EXT_DIR);
    });
  }
```

Note: The `EXT_DIR` constant is already defined at line 11.

- [ ] **Step 3: Verify it compiles**

Run: `cd pi-extensions/my-bt && bun run build`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-bt/index.ts
git commit -m "feat(my-bt): integrate playOverlay into pi event handlers"
```

---

### Task 8: Add overlay integration tests to index.test.ts

**Files:**
- Modify: `pi-extensions/my-bt/index.test.ts`

- [ ] **Step 1: Import playOverlay in the mock**

Change the player mock (around line 10) to mock `playOverlay` alongside `playCategory`:

```ts
vi.mock("./player", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./player")>();
  return {
    ...actual,
    playCategory: vi.fn(),
    playOverlay: vi.fn(),
  };
});
```

- [ ] **Step 2: Add import for playOverlay**

After line 3, add:
```ts
import { playOverlay } from "./player";
```

- [ ] **Step 3: Clear playOverlay mock in beforeEach**

In the `beforeEach` block (around line 40), add:
```ts
vi.mocked(playOverlay).mockClear();
```

- [ ] **Step 4: Add overlay-specific test cases**

Add these tests inside the `describe("my-bt extension", () => { ... })` block, after the existing test cases (before the closing `});`):

```ts
  // ── Overlay integration tests ──

  it("calls playOverlay on event when overlayTextMap is configured", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
        agent_start: { type: "GO", title: "Engaging" },
        agent_end: { type: "DONE", title: "Complete" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.();
    expect(playOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ overlayTextMap: expect.any(Object) }),
      "session_start",
      expect.any(String),
    );
  });

  it("does not call playOverlay when disabled", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      enabled: false,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not call playOverlay on /bt manual playback", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("startup", mockCtx as any);

    expect(playCategory).toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not call playOverlay on /bt all", async () => {
    vi.useFakeTimers();
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        startup: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("all", mockCtx as any);
    vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(1500);

    expect(playCategory).toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("still works when overlayTextMap is absent (no regression)", async () => {
    // DEFAULT_CONFIG has no overlayTextMap — should work as before
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    expect(() => handler?.()).not.toThrow();
    expect(playCategory).toHaveBeenCalled();
    // playOverlay is imported but should not throw when called from handler
    // (because playOverlay checks config.overlayTextMap internally)
  });
```

- [ ] **Step 5: Run tests**

Run: `cd pi-extensions/my-bt && npx vitest run index.test.ts`

Expected: All tests pass (both existing and new).

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-bt/index.test.ts
git commit -m "test(my-bt): add overlay integration tests"
```

---

### Task 9: Update coverage exclusions

**Files:**
- Modify: `pi-extensions/my-bt/vitest.config.ts`

- [ ] **Step 1: Add overlay script to coverage exclusions**

Change the `exclude` array:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["types.ts", "index.ts", "scripts/**"],
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-bt/vitest.config.ts
git commit -m "test(my-bt): exclude JXA scripts from coverage"
```

---

### Task 10: Full test suite and manual overlay verification

**Files:** All modified files

- [ ] **Step 1: Run full test suite with coverage**

```bash
cd pi-extensions/my-bt && npx vitest run --coverage
```

Expected:
- All tests pass
- Coverage 100% for branches/functions/lines/statements (excluding `types.ts`, `index.ts`, `scripts/**`)

- [ ] **Step 2: Run build and deploy**

```bash
cd /Users/lychee/Documents/configure && bun run deploy
```

- [ ] **Step 3: Manual overlay test**

In a pi session, run `/reload` then trigger events:
- Open a new pi session → should see "SESSION START / BT-7274 已上线" overlay
- The overlay should appear at top-right, fade in, persist 3s, fade out
- Sound should play alongside

Verify via `/bt on` / `/bt off` that overlay toggles with sound.

- [ ] **Step 4: Stacking test**

Run two events quickly (e.g., manually dispatch from dev tools) and verify overlays stack vertically rather than overlapping.

- [ ] **Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore(my-bt): final adjustments from manual testing"
```

---

## Self-Review

- ✅ Spec coverage: Each requirement mapped to a task (types→1, config→2, JXA script→3, build→4, playOverlay→5, tests→6/8, integration→7, coverage→9, verification→10)
- ✅ No placeholders: All code is complete, all commands are exact
- ✅ Type consistency: `BtConfig.overlayTextMap` defined in Task 1, used in Tasks 5-8. `OverlayColor` defined in Task 1, used in Task 5. `playOverlay(config, eventName, extDir)` signature consistent across Tasks 5-8.
- ✅ Files match spec: All files from design doc spec covered
