/**
 * my-zen — zen rendering for built-in tools.
 *
 * Overrides read/bash/edit/write/grep/find/ls with renderShell: "self" to
 * drop the default padded Box shell. A dim summary line renders only while
 * the tool is running (or when expanded); settled successful calls occupy
 * zero lines. Errors and non-zero bash exit codes always render one red
 * line. ctrl+o expands to full output.
 *
 * /zen (bare) toggles on/off. /zen off hands tool and user-message
 * rendering back to pi-tool-display: my-zen stops registering overrides and
 * pi-tool-display's registerToolOverrides are re-enabled. Mode switches
 * rewrite both configs and ctx.reload().
 */

import { homedir } from "node:os";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  loadZenConfig,
  parseZenMode,
  saveZenConfig,
  setToolDisplayOverrides,
  syncThemeWithMode,
  ZEN_CONFIG_PATH,
  ZEN_MODES,
  type ZenMode,
} from "./config";
import {
  extractExitCode,
  extractText,
  firstLine,
  formatCallText,
  formatGenericCallText,
  hasImage,
  type ToolResultLike,
} from "./format";

interface BuiltInTool {
  description: string;
  parameters: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute: (...args: never[]) => Promise<unknown>;
}

type BuiltInFactory = (cwd: string) => BuiltInTool;

interface RenderResultOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface RenderContext {
  isError?: boolean;
}

/** Zero-line component used for invisible results and settled calls. */
const EMPTY_COMPONENT = {
  render: () => [] as string[],
  invalidate: () => {},
};

let currentMode: ZenMode = "on";

// ── User message rebuild patch ──────────────────────────────────────────────
// pi has no API to restyle user messages. pi-tool-display monkey-patches
// UserMessageComponent.prototype.render with an ownership guard that kicks
// out foreign patches — and it loads after ly-pi, so fighting over `render`
// is a losing game. Instead we patch `rebuild` (which nobody else touches).
//
// Native rebuild creates `new Box(outputPad, 1, bg)`: outputPad is the
// HORIZONTAL padding (the left color edge) and the second argument is the
// hardcoded vertical padding producing the blank rows above/below. We keep
// outputPad untouched and drop the Box's paddingY post-hoc — Box fields are
// public and the render cache is cold right after rebuild.
// /zen also disables pi-tool-display's enableNativeUserMessageBox so its
// render wrapper passes through to the native render.

interface BoxLike {
  paddingY: number;
  bgFn?: (line: string) => string;
  invalidateCache?: () => void;
}

interface RebuildableUserProto {
  rebuild: (this: { children?: unknown[]; outputPad?: number }) => void;
}

let savedUserRebuild: RebuildableUserProto["rebuild"] | undefined;
let activeTheme: Theme | undefined;

function zenUserRebuild(this: {
  children?: unknown[];
  outputPad?: number;
}): void {
  savedUserRebuild?.call(this);
  const box = this?.children?.[0] as BoxLike | undefined;
  if (!box || typeof box.paddingY !== "number") return;
  box.paddingY = 0;
  // Wrap bgFn: swap the horizontal padding column for an accent-colored bar.
  // A background-colored padding cell is invisible against the full-width
  // background bar, so the left edge needs a distinct color to be seen.
  const pad = this?.outputPad ?? 1;
  const originalBgFn = box.bgFn;
  box.bgFn = (line: string) => {
    const theme = activeTheme;
    if (!theme) return originalBgFn ? originalBgFn(line) : line;
    const bar = theme.fg("accent", "▎");
    const rest =
      pad > 0 && line.startsWith(" ")
        ? line.slice(1)
        : truncateToWidth(line, Math.max(0, visibleWidth(line) - 1), "");
    return theme.bg("userMessageBg", bar + rest);
  };
  box.invalidateCache?.();
}

function userMessagePrototype(): RebuildableUserProto {
  return UserMessageComponent.prototype as unknown as RebuildableUserProto;
}

function patchUserMessageRebuild(): void {
  const proto = userMessagePrototype();
  if (proto.rebuild === zenUserRebuild) return;
  savedUserRebuild = proto.rebuild;
  proto.rebuild = zenUserRebuild;
}

function restoreUserMessageRebuild(): void {
  const proto = userMessagePrototype();
  if (proto.rebuild === zenUserRebuild && savedUserRebuild) {
    proto.rebuild = savedUserRebuild;
  }
}

// ── Global tool rendering patch ──────────────────────────────────────────────
// Each extension gets its own ExtensionAPI object, so wrapping pi.registerTool
// only intercepts ly-pi's own registrations — foreign tools (todo, web_search,
// chrome-devtools, ...) register through their own api instances and are
// unreachable that way. ToolExecutionComponent, however, is the single shared
// component that renders EVERY tool call/result, and it re-reads its renderers
// on every state change (updateDisplay → getRenderShell/getCallRenderer/
// getResultRenderer). Patching its prototype getters zenifies all tools
// regardless of origin.

const ZEN_OWNED_TOOLS = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
]);

interface ToolExecutionProto {
  toolName: string;
  getRenderShell(): string;
  getCallRenderer(): unknown;
  getResultRenderer(): unknown;
}

type CallRenderer = (
  args: Record<string, unknown>,
  theme: Theme,
  context?: { isPartial?: boolean; expanded?: boolean },
) => unknown;

type ResultRenderer = (
  result: ToolResultLike,
  options: { expanded?: boolean; isPartial?: boolean },
  theme: Theme,
  context?: { isError?: boolean },
) => unknown;

let savedGetRenderShell: ToolExecutionProto["getRenderShell"] | undefined;
let savedGetCallRenderer: ToolExecutionProto["getCallRenderer"] | undefined;
let savedGetResultRenderer:
  | ToolExecutionProto["getResultRenderer"]
  | undefined;
const zenCallCache = new WeakMap<object, CallRenderer>();
const zenResultCache = new WeakMap<object, ResultRenderer>();

function makeZenCallRenderer(
  name: string,
  original?: CallRenderer,
): CallRenderer {
  return (args, theme, context) => {
    const expanded = context?.expanded ?? false;
    const isPartial = context?.isPartial ?? true;
    if (expanded && original) return original(args, theme, context);
    if (!expanded && !isPartial) return EMPTY_COMPONENT;
    return new Text(
      theme.fg("dim", formatGenericCallText(name, args ?? {})),
      0,
      0,
    );
  };
}

function makeZenResultRenderer(
  name: string,
  original?: ResultRenderer,
): ResultRenderer {
  return (result, options, theme, context) => {
    if (options?.isPartial) return EMPTY_COMPONENT;
    if (context?.isError) {
      const text = extractText(result);
      return new Text(theme.fg("error", firstLine(text ?? name)), 0, 0);
    }
    if (!(options?.expanded ?? false)) return EMPTY_COMPONENT;
    if (original) return original(result, options, theme, context);
    const text = extractText(result);
    return text
      ? new Text(theme.fg("toolOutput", text.trimEnd()), 0, 0)
      : EMPTY_COMPONENT;
  };
}

function zenGetRenderShell(): string {
  return "self";
}

function zenGetCallRenderer(this: ToolExecutionProto): unknown {
  const original = savedGetCallRenderer?.call(this) as
    | CallRenderer
    | undefined;
  if (ZEN_OWNED_TOOLS.has(this.toolName)) return original;
  let wrapped = zenCallCache.get(this);
  if (!wrapped) {
    wrapped = makeZenCallRenderer(this.toolName, original);
    zenCallCache.set(this, wrapped);
  }
  return wrapped;
}

function zenGetResultRenderer(this: ToolExecutionProto): unknown {
  const original = savedGetResultRenderer?.call(this) as
    | ResultRenderer
    | undefined;
  if (ZEN_OWNED_TOOLS.has(this.toolName)) return original;
  let wrapped = zenResultCache.get(this);
  if (!wrapped) {
    wrapped = makeZenResultRenderer(this.toolName, original);
    zenResultCache.set(this, wrapped);
  }
  return wrapped;
}

function patchToolExecutionComponent(): void {
  const proto =
    ToolExecutionComponent.prototype as unknown as ToolExecutionProto;
  if (proto.getRenderShell === zenGetRenderShell) return;
  savedGetRenderShell = proto.getRenderShell;
  savedGetCallRenderer = proto.getCallRenderer;
  savedGetResultRenderer = proto.getResultRenderer;
  proto.getRenderShell = zenGetRenderShell;
  proto.getCallRenderer = zenGetCallRenderer;
  proto.getResultRenderer = zenGetResultRenderer;
}

function restoreToolExecutionComponent(): void {
  const proto =
    ToolExecutionComponent.prototype as unknown as ToolExecutionProto;
  if (proto.getRenderShell !== zenGetRenderShell) return;
  if (savedGetRenderShell) proto.getRenderShell = savedGetRenderShell;
  if (savedGetCallRenderer) proto.getCallRenderer = savedGetCallRenderer;
  if (savedGetResultRenderer)
    proto.getResultRenderer = savedGetResultRenderer;
}

function colorizeDiff(diff: string, theme: Theme): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return theme.fg("success", line);
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        return theme.fg("error", line);
      }
      return theme.fg("toolOutput", line);
    })
    .join("\n");
}

function renderZenResult(
  toolName: string,
  result: ToolResultLike,
  { expanded, isPartial }: RenderResultOptions,
  theme: Theme,
  context: RenderContext,
) {
  if (isPartial) {
    // the call row already carries a dim summary while running
    return EMPTY_COMPONENT;
  }

  const text = extractText(result);

  if (context.isError) {
    return new Text(theme.fg("error", firstLine(text ?? "Error")), 0, 0);
  }

  if (!expanded) {
    if (toolName === "bash" && text) {
      const code = extractExitCode(text);
      if (code !== null && code !== 0) {
        return new Text(theme.fg("error", `exit ${code}`), 0, 0);
      }
    }
    return EMPTY_COMPONENT;
  }

  if (toolName === "read" && hasImage(result)) {
    return new Text(theme.fg("success", "image loaded"), 0, 0);
  }

  if (toolName === "edit") {
    const diff = result.details?.diff;
    if (typeof diff === "string" && diff) {
      return new Text(colorizeDiff(diff, theme), 0, 0);
    }
  }

  if (!text) {
    return EMPTY_COMPONENT;
  }
  return new Text(theme.fg("toolOutput", text.trimEnd()), 0, 0);
}

export default function myZen(pi: ExtensionAPI): void {
  const home = homedir();
  currentMode = loadZenConfig(ZEN_CONFIG_PATH).mode;
  // Keep the theme aligned with the mode (inverted user message colors live
  // in the zen theme variant). Silent heal: the switch takes effect on the
  // next reload.
  syncThemeWithMode(currentMode);

  if (currentMode !== "off") {
    // User messages: zero vertical padding, accent bar at the left edge.
    patchUserMessageRebuild();
    // Tool rendering: zen renderers for every tool via the shared component.
    patchToolExecutionComponent();
    pi.on("session_start", async (_event, ctx) => {
      activeTheme = ctx.ui.theme;
    });
    pi.on("session_shutdown", async (event) => {
      if ((event as { reason?: string }).reason === "reload") {
        restoreUserMessageRebuild();
        restoreToolExecutionComponent();
      }
    });

    const factories: Record<string, BuiltInFactory> = {
      read: createReadTool as BuiltInFactory,
      bash: createBashTool as BuiltInFactory,
      edit: createEditTool as BuiltInFactory,
      write: createWriteTool as BuiltInFactory,
      grep: createGrepTool as BuiltInFactory,
      find: createFindTool as BuiltInFactory,
      ls: createLsTool as BuiltInFactory,
    };

    for (const [name, factory] of Object.entries(factories)) {
      const proto = factory(process.cwd());
      const cache = new Map<string, BuiltInTool>();
      pi.registerTool({
        name,
        label: name,
        description: proto.description,
        parameters: proto.parameters as never,
        promptSnippet: proto.promptSnippet,
        promptGuidelines: proto.promptGuidelines,
        renderShell: "self",

        async execute(toolCallId, params, signal, onUpdate, ctx) {
          const cwd = ctx?.cwd ?? process.cwd();
          let tool = cache.get(cwd);
          if (!tool) {
            tool = factory(cwd);
            cache.set(cwd, tool);
          }
          return tool.execute(
            toolCallId as never,
            params as never,
            signal as never,
            onUpdate as never,
            ctx as never,
          ) as never;
        },

        renderCall(args, theme, context) {
          const expanded = context?.expanded ?? false;
          const isPartial = context?.isPartial ?? true;
          // settled collapsed calls are invisible
          if (!expanded && !isPartial) {
            return EMPTY_COMPONENT;
          }
          const summary = formatCallText(
            name,
            args as Record<string, unknown>,
            home,
          );
          return new Text(theme.fg("dim", summary), 0, 0);
        },

        renderResult(result, options, theme, context) {
          return renderZenResult(
            name,
            result as ToolResultLike,
            options,
            theme,
            context ?? {},
          );
        },
      });
    }
  }

  pi.registerCommand("zen", {
    description:
      "禅模式开关：/zen（切换）| /zen on | /zen off（交还 pi-tool-display）",
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      let next: ZenMode;
      if (!trimmed) {
        next = currentMode === "on" ? "off" : "on";
      } else {
        const parsed = parseZenMode(trimmed);
        if (!parsed) {
          ctx.ui.notify(
            `未知模式 "${trimmed}"，可用：${ZEN_MODES.join(" / ")}`,
            "warning",
          );
          return;
        }
        if (parsed === currentMode) {
          ctx.ui.notify(`已是 ${parsed} 模式`, "info");
          return;
        }
        next = parsed;
      }

      currentMode = next;
      try {
        saveZenConfig(ZEN_CONFIG_PATH, { mode: next });
        syncThemeWithMode(next);
      } catch (err) {
        ctx.ui.notify(
          `配置写入失败：${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        return;
      }

      // Hand built-in tool rendering back and forth with pi-tool-display.
      if (!setToolDisplayOverrides(next === "off")) {
        ctx.ui.notify(
          "未检测到 pi-tool-display 配置，工具将使用 pi 原生渲染",
          "warning",
        );
      }

      ctx.ui.notify(`my-zen 已切换到 ${next}，正在 reload…`, "info");
      await ctx.reload();
    },
  });
}
