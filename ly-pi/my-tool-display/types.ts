import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";

export type WritePreview =
  | { safe: true; previousContent: string; snapshot: WritePreviewSnapshot }
  | { safe: false; reason: string };

export type WriteDiffDetails =
  | { kind: "diff"; diff: string }
  | { kind: "summary"; summary: string };

export type WritePreviewSnapshot =
  | {
      path: string;
      existed: true;
      device: number;
      inode: number;
      size: number;
      mtimeMs: number;
    }
  | { path: string; existed: false };

export type WriteToolDetails = Record<string, unknown> & {
  writeDiff: WriteDiffDetails;
};

export type NativeWriteDefinition = ReturnType<
  typeof createWriteToolDefinition
>;
export type NativeWriteParameters = Parameters<
  NativeWriteDefinition["execute"]
>;
export type WriteToolResult = AgentToolResult<WriteToolDetails>;
export type ReplaceFirst<
  Arguments extends readonly unknown[],
  First,
> = Arguments extends readonly [unknown, ...infer Rest]
  ? [First, ...Rest]
  : never;
export type WriteToolOverride = Omit<
  NativeWriteDefinition,
  "execute" | "renderResult"
> & {
  execute: (
    toolCallId: NativeWriteParameters[0],
    params: NativeWriteParameters[1],
    signal: NativeWriteParameters[2],
    onUpdate: AgentToolUpdateCallback<WriteToolDetails> | undefined,
    ctx: NativeWriteParameters[4],
  ) => Promise<WriteToolResult>;
  renderResult: (
    ...args: ReplaceFirst<
      Parameters<NonNullable<NativeWriteDefinition["renderResult"]>>,
      WriteToolResult
    >
  ) => ReturnType<NonNullable<NativeWriteDefinition["renderResult"]>>;
};

export type SafeWritePath =
  | { safe: true; path: string; existed: true; device: number; inode: number }
  | { safe: true; path: string; existed: false }
  | { safe: false; reason: string };

export type ResolvedWritePath =
  | { resolved: true; path: string }
  | { resolved: false; reason: string };

export type RealpathResult =
  | { resolved: true; path: string }
  | { resolved: false; error: unknown };
