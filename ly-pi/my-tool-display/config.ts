import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const ToolDisplayConfigSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    bashCollapsedLines: Type.Optional(Type.Integer({ minimum: 0 })),
    diffCollapsedLines: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

type ToolDisplayConfigFile = Static<typeof ToolDisplayConfigSchema>;
export type ToolDisplayConfig = Omit<
  ToolDisplayConfigFile,
  "bashCollapsedLines" | "diffCollapsedLines"
> & {
  bashCollapsedLines: number;
  diffCollapsedLines: number;
};

export const DEFAULT_TOOL_DISPLAY_CONFIG: ToolDisplayConfig = {
  enabled: true,
  bashCollapsedLines: 10,
  diffCollapsedLines: 24,
};

export function loadToolDisplayConfig(): ToolDisplayConfig {
  try {
    const path = join(
      getAgentDir(),
      "extensions",
      "ly-pi",
      "my-tool-display.json",
    );
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (!Value.Check(ToolDisplayConfigSchema, parsed)) {
      return { ...DEFAULT_TOOL_DISPLAY_CONFIG };
    }

    return {
      enabled: parsed.enabled,
      bashCollapsedLines:
        parsed.bashCollapsedLines ??
        DEFAULT_TOOL_DISPLAY_CONFIG.bashCollapsedLines,
      diffCollapsedLines:
        parsed.diffCollapsedLines ??
        DEFAULT_TOOL_DISPLAY_CONFIG.diffCollapsedLines,
    };
  } catch {
    return { ...DEFAULT_TOOL_DISPLAY_CONFIG };
  }
}
