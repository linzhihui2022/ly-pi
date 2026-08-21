import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const ToolDisplayConfigSchema = Type.Object(
  {
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type ToolDisplayConfig = Static<typeof ToolDisplayConfigSchema>;

export const DEFAULT_TOOL_DISPLAY_CONFIG: ToolDisplayConfig = {
  enabled: true,
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
    return Value.Check(ToolDisplayConfigSchema, parsed)
      ? parsed
      : { ...DEFAULT_TOOL_DISPLAY_CONFIG };
  } catch {
    return { ...DEFAULT_TOOL_DISPLAY_CONFIG };
  }
}
