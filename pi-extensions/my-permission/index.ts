import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { loadConfig, resolveConfigPath } from "./config.js";
import { PermissionState } from "./state.js";
import type { PermissionStateSnapshot } from "./types.js";

const CONFIG_PATH = resolveConfigPath();

const USAGE = "用法：/permission deny <tool> | allow <tool> | list | reset";

function formatList(entries: { tool: string; source: string }[]): string {
  if (entries.length === 0) return "当前没有被禁工具。";
  const lines = entries.map((e) => `${e.tool} (${e.source})`);
  return `当前被禁工具：\n${lines.join("\n")}`;
}

export default function myPermission(pi: ExtensionAPI): void {
  let state = new PermissionState();

  function persist(): void {
    pi.appendEntry("my-permission", state.snapshot() as PermissionStateSnapshot);
  }

  pi.on("session_start", async (_event, ctx) => {
    const config = loadConfig(CONFIG_PATH, (message, level) => {
      ctx.ui.notify(message, level);
    });
    state = PermissionState.fromEntries(
      ctx.sessionManager.getEntries(),
      config,
    );
  });

  pi.on("tool_call", async (event, _ctx) => {
    const denied = state.list().map((e) => e.tool);
    if (denied.includes(event.toolName)) {
      return {
        block: true,
        reason: `Tool '${event.toolName}' is denied by my-permission`,
      };
    }
  });

  pi.on("before_agent_start", async (_event, _ctx) => {
    const denied = state.list().map((e) => e.tool);
    if (denied.length === 0) return;
    return {
      message: {
        customType: "my-permission",
        content: `The following tools are currently denied and cannot be used: ${denied.join(", ")}.`,
        display: false,
      },
    };
  });

  pi.registerMessageRenderer("my-permission", (_message, _options, theme) => {
    return new Text(theme.fg("dim", "[my-permission]"), 0, 0);
  });

  pi.registerCommand("permission", {
    description: "管理被禁工具：deny、allow、list、reset",
    getArgumentCompletions: (prefix: string) => {
      const trimmed = prefix.trimStart();
      const parts = trimmed.split(/\s+/);
      if (parts.length !== 2) return null;
      const sub = parts[0];
      if (sub !== "deny" && sub !== "allow") return null;
      const toolPrefix = parts[1] ?? "";
      const tools = pi
        .getAllTools()
        .map((t) => t.name)
        .filter((name) => name.startsWith(toolPrefix));
      return tools.map((name) => ({
        value: name,
        label: name,
        description: sub,
      }));
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const trimmed = (args ?? "").trim();
      const [sub, tool] = trimmed.split(/\s+/, 2);

      if (sub === "deny") {
        if (!tool) {
          ctx.ui.notify("用法：/permission deny <tool>", "warning");
          return;
        }
        state.deny(tool);
        persist();
        ctx.ui.notify(`已禁止 ${tool}`, "info");
        return;
      }

      if (sub === "allow") {
        if (!tool) {
          ctx.ui.notify("用法：/permission allow <tool>", "warning");
          return;
        }
        state.allow(tool);
        persist();
        ctx.ui.notify(`已恢复 ${tool}`, "info");
        return;
      }

      if (sub === "list") {
        ctx.ui.notify(formatList(state.list()), "info");
        return;
      }

      if (sub === "reset") {
        state.reset();
        persist();
        ctx.ui.notify("已恢复为配置文件默认值", "info");
        return;
      }

      ctx.ui.notify(USAGE, "warning");
    },
  });
}
