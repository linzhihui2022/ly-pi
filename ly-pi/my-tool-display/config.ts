import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { createDevLogger } from "../my-log/index";

const ToolDisplayConfigSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    bashCollapsedLines: Type.Optional(Type.Unknown()),
    diffCollapsedLines: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const CollapsedLinesSchema = Type.Integer({ minimum: 0 });

type ToolDisplayConfigFile = Static<typeof ToolDisplayConfigSchema>;
export type NonNegativeInteger = number & {
  readonly __brand: "NonNegativeInteger";
};
export type ToolDisplayConfig = Omit<
  ToolDisplayConfigFile,
  "bashCollapsedLines" | "diffCollapsedLines"
> & {
  bashCollapsedLines: NonNegativeInteger;
  diffCollapsedLines: NonNegativeInteger;
};

export const DEFAULT_TOOL_DISPLAY_CONFIG: Readonly<ToolDisplayConfig> =
  Object.freeze({
    enabled: true,
    bashCollapsedLines: 10 as NonNegativeInteger,
    diffCollapsedLines: 24 as NonNegativeInteger,
  });

const log = createDevLogger("my-tool-display:config");
const warnedConfigValues = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warnedConfigValues.has(key)) {
    return;
  }
  warnedConfigValues.add(key);
  log.warn(message);
}

function parseCollapsedLines(
  field: "bashCollapsedLines" | "diffCollapsedLines",
  value: unknown,
  fallback: NonNegativeInteger,
): NonNegativeInteger {
  if (Value.Check(CollapsedLinesSchema, value)) {
    return value as NonNegativeInteger;
  }
  if (value !== undefined) {
    warnOnce(
      field,
      `Invalid ${field} in my-tool-display.json; using the default value.`,
    );
  }
  return fallback;
}

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
      warnOnce(
        "schema",
        "Invalid my-tool-display.json; using the default configuration.",
      );
      return { ...DEFAULT_TOOL_DISPLAY_CONFIG };
    }

    return {
      enabled: parsed.enabled,
      bashCollapsedLines: parseCollapsedLines(
        "bashCollapsedLines",
        parsed.bashCollapsedLines,
        DEFAULT_TOOL_DISPLAY_CONFIG.bashCollapsedLines,
      ),
      diffCollapsedLines: parseCollapsedLines(
        "diffCollapsedLines",
        parsed.diffCollapsedLines,
        DEFAULT_TOOL_DISPLAY_CONFIG.diffCollapsedLines,
      ),
    };
  } catch {
    return { ...DEFAULT_TOOL_DISPLAY_CONFIG };
  }
}
