import { mkdir, writeFile } from "node:fs/promises";
import {
  type AgentToolUpdateCallback,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  generateDiffString,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { loadToolDisplayConfig } from "./config";
import {
  describeError,
  logUnexpectedPreviewError,
  withErrorDetails,
} from "./errors";
import { log } from "./logger";
import {
  formatEditCall,
  formatReadCall,
  formatWriteCall,
  renderBashResult,
  renderCompactTextResult,
  renderEditResult,
  renderWriteResult,
} from "./render";
import {
  getWriteDiffDetails,
  hasVisibleOutput,
  sanitizeToolCallArgs,
  textOutput,
} from "./sanitize";
import type {
  WriteDiffDetails,
  WritePreview,
  WriteToolOverride,
} from "./types";
import {
  addWriteDiffDetails,
  isWritePreviewCurrent,
  MAX_WRITE_DIFF_BYTES,
  readWritePreview,
  writeDiffByContent,
} from "./write-snapshot";

const registeredToolNames = new WeakMap<ExtensionAPI, Set<string>>();

function getBuiltinToolNames(pi: ExtensionAPI): Set<string> {
  try {
    return new Set(
      pi
        .getAllTools()
        .filter((tool) => tool.sourceInfo.source === "builtin")
        .map((tool) => tool.name),
    );
  } catch (error) {
    log.warn(
      "Unable to discover builtin tools; custom tool renderers are disabled.",
      { error: describeError(error) },
    );
    return new Set();
  }
}

function registerToolOverride(
  toolName: string,
  register: () => void,
  registeredNames: Set<string>,
): void {
  if (registeredNames.has(toolName)) {
    return;
  }
  try {
    register();
    registeredNames.add(toolName);
  } catch (error) {
    log.error(`Unable to register ${toolName} renderer.`, {
      error: describeError(error),
      tool: toolName,
    });
  }
}

export function registerToolRenderers(
  pi: ExtensionAPI,
  config: ReturnType<typeof loadToolDisplayConfig>,
): void {
  const builtinToolNames = getBuiltinToolNames(pi);
  if (builtinToolNames.size === 0) {
    return;
  }
  const registeredNames = registeredToolNames.get(pi) ?? new Set<string>();
  registeredToolNames.set(pi, registeredNames);

  if (builtinToolNames.has("write")) {
    const nativeWrite = createWriteToolDefinition(process.cwd());
    const writeOverride: WriteToolOverride = {
      ...nativeWrite,
      renderShell: "default",
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        let preview: WritePreview | undefined;
        const result = await createWriteToolDefinition(ctx.cwd, {
          operations: {
            async mkdir(path) {
              await mkdir(path, { recursive: true });
            },
            async writeFile(path, content) {
              preview = readWritePreview(ctx.cwd, path, content);
              if (preview.safe && !isWritePreviewCurrent(preview)) {
                preview = {
                  safe: false,
                  reason:
                    "Write diff unavailable because the target changed while preparing the write.",
                };
              }
              await writeFile(path, content, "utf8");
            },
          },
        }).execute(
          toolCallId,
          params,
          signal,
          onUpdate as AgentToolUpdateCallback<undefined> | undefined,
          ctx,
        );

        let details: WriteDiffDetails;
        if (!preview?.safe) {
          details = {
            kind: "summary",
            summary:
              preview?.reason ??
              "Write diff unavailable because the previous content could not be captured safely.",
          };
        } else {
          try {
            const generated = generateDiffString(
              preview.previousContent,
              params.content,
            );
            if (!generated || typeof generated.diff !== "string") {
              details = {
                kind: "summary",
                summary:
                  "Write diff unavailable because it could not be computed safely.",
              };
            } else if (
              Buffer.byteLength(generated.diff, "utf8") > MAX_WRITE_DIFF_BYTES
            ) {
              details = {
                kind: "summary",
                summary: `Write diff unavailable because the generated diff exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
              };
            } else {
              details = generated.diff
                ? { kind: "diff", diff: generated.diff }
                : {
                    kind: "summary",
                    summary: "Write completed; no text changes to display.",
                  };
            }
          } catch (error) {
            logUnexpectedPreviewError(
              "Unexpected error while computing write diff.",
              error,
            );
            details = {
              kind: "summary",
              summary: withErrorDetails(
                "Write diff unavailable because it could not be computed safely.",
                error,
              ),
            };
          }
        }

        const resultWithDetails = addWriteDiffDetails(result, details);
        writeDiffByContent.set(resultWithDetails.content, details);
        return resultWithDetails;
      },
      renderCall(args, theme) {
        return new Text(formatWriteCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        return renderWriteResult(
          result,
          writeDiffByContent.get(result.content) ??
            getWriteDiffDetails(result.details),
          options,
          theme,
          context,
          config.diffCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "write",
      () => pi.registerTool(writeOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("edit")) {
    const nativeEdit = createEditToolDefinition(process.cwd());
    const editOverride: typeof nativeEdit = {
      ...nativeEdit,
      renderShell: "default",
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createEditToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderCall(args, theme) {
        return new Text(formatEditCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        return renderEditResult(
          result,
          options,
          theme,
          context,
          config.diffCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "edit",
      () => pi.registerTool(editOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("bash")) {
    const nativeBash = createBashToolDefinition(process.cwd());
    const bashOverride: typeof nativeBash = {
      ...nativeBash,
      renderCall(args, theme, context) {
        if (!nativeBash.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeBash.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
          projectTrusted: ctx.isProjectTrusted(),
        });
        return createBashToolDefinition(ctx.cwd, {
          commandPrefix: settings.getShellCommandPrefix(),
          shellPath: settings.getShellPath(),
        }).execute(toolCallId, params, signal, onUpdate, ctx);
      },
      renderResult(result, options, theme, context) {
        return renderBashResult(
          result,
          options,
          theme,
          context,
          config.bashCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "bash",
      () => pi.registerTool(bashOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("read")) {
    const nativeRead = createReadToolDefinition(process.cwd());
    const readOverride: typeof nativeRead = {
      ...nativeRead,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
          projectTrusted: ctx.isProjectTrusted(),
        });
        return createReadToolDefinition(ctx.cwd, {
          autoResizeImages: settings.getImageAutoResize(),
        }).execute(toolCallId, params, signal, onUpdate, ctx);
      },
      renderCall(args, theme) {
        return new Text(formatReadCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        const output = textOutput(result);
        if (context.isError) {
          return new Text(
            theme.fg(
              "error",
              hasVisibleOutput(output) ? output : "Read failed.",
            ),
            0,
            0,
          );
        }
        if (options.isPartial) {
          return new Text(theme.fg("warning", "Reading..."), 0, 0);
        }
        if (!options.expanded) {
          return new Text("", 0, 0);
        }
        if (
          result.content.some((content) => content.type === "image") &&
          nativeRead.renderResult
        ) {
          return nativeRead.renderResult(result, options, theme, context);
        }
        return new Text(theme.fg("toolOutput", output), 0, 0);
      },
    };

    registerToolOverride(
      "read",
      () => pi.registerTool(readOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("grep")) {
    const nativeGrep = createGrepToolDefinition(process.cwd());
    const grepOverride: typeof nativeGrep = {
      ...nativeGrep,
      renderCall(args, theme, context) {
        if (!nativeGrep.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeGrep.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createGrepToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Searching...",
          "Search failed.",
        );
      },
    };

    registerToolOverride(
      "grep",
      () => pi.registerTool(grepOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("find")) {
    const nativeFind = createFindToolDefinition(process.cwd());
    const findOverride: typeof nativeFind = {
      ...nativeFind,
      renderCall(args, theme, context) {
        if (!nativeFind.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeFind.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createFindToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Finding files...",
          "Find failed.",
        );
      },
    };

    registerToolOverride(
      "find",
      () => pi.registerTool(findOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("ls")) {
    const nativeLs = createLsToolDefinition(process.cwd());
    const lsOverride: typeof nativeLs = {
      ...nativeLs,
      renderCall(args, theme, context) {
        if (!nativeLs.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeLs.renderCall(sanitizeToolCallArgs(args), theme, context);
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createLsToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Listing files...",
          "List failed.",
        );
      },
    };

    registerToolOverride(
      "ls",
      () => pi.registerTool(lsOverride),
      registeredNames,
    );
  }
}
