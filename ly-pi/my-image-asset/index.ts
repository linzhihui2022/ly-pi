import { dirname, resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { resolveAutomaticImageAssetRequest } from "./auto-output";
import {
  ImageAssetBatchError,
  type ImageAssetFileOperations,
  type ImageAssetRunner,
  type ImageDecoder,
  runImageAssetBatch,
} from "./batch";
import { createCodexImageRunner, createSipsImageDecoder } from "./codex";
import {
  authorizeImageAssetCall,
  automaticOutputKind,
  buildFinalImagePrompt,
  type ImageAssetAuthorization,
  ImageAssetError,
  imageAssetSchema,
  type ResolvedImageAssetRequest,
} from "./contract";
import { readImageAssetConversation } from "./session";

const IMAGE_ASSET_TOOL_NAME = "image_asset";

export interface ImageAssetToolDependencies {
  readonly runner?: ImageAssetRunner;
  readonly decoder?: ImageDecoder;
  readonly fileOperations?: ImageAssetFileOperations;
}

type RejectedImageAssetAuthorization = Extract<
  ImageAssetAuthorization,
  { readonly authorized: false }
>;

interface ImageAssetToolDetails {
  readonly status: "published";
  readonly authorization: "direct" | "confirmed";
  readonly operation: "generate" | "edit" | "enhance";
  readonly finalPrompt: string;
  readonly sources: {
    readonly targetPath: string | null;
    readonly referencePath: string | null;
  };
  readonly outputPaths: readonly string[];
  readonly outputs: readonly {
    readonly path: string;
    readonly status: "published";
  }[];
}

class ImageAssetToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageAssetToolError";
  }
}

async function withOutputMutationQueues<T>(
  outputPaths: readonly string[],
  operation: () => Promise<T>,
): Promise<T> {
  const orderedPaths = [...new Set(outputPaths)].sort();
  const queue = async (index: number): Promise<T> => {
    const outputPath = orderedPaths[index];
    return outputPath
      ? withFileMutationQueue(outputPath, () => queue(index + 1))
      : operation();
  };
  return queue(0);
}

function authorizationError(
  authorization: RejectedImageAssetAuthorization,
): Error {
  if (authorization.reason === "confirmation_required") {
    return new ImageAssetToolError(
      "Image asset confirmation does not match the pending proposal.",
    );
  }
  return new ImageAssetToolError(
    "Image asset operation requires an explicit user image request.",
  );
}

function safeToolError(error: unknown): Error {
  if (
    error instanceof ImageAssetToolError ||
    error instanceof ImageAssetError ||
    error instanceof ImageAssetBatchError
  ) {
    return error;
  }
  return new ImageAssetToolError("Image asset operation failed.");
}

function formatSuccessMessage(details: ImageAssetToolDetails): string {
  return [
    "Image assets published.",
    `Operation: ${details.operation}`,
    `Outputs: ${details.outputPaths.join(", ")}`,
    "",
    "Final prompt:",
    details.finalPrompt,
  ].join("\n");
}

export function registerImageAssetTool(
  pi: ExtensionAPI,
  dependencies: ImageAssetToolDependencies = {},
): void {
  const runner = dependencies.runner ?? createCodexImageRunner();
  const decoder = dependencies.decoder ?? createSipsImageDecoder();

  pi.registerTool({
    name: IMAGE_ASSET_TOOL_NAME,
    label: "Image Asset",
    description:
      "Generate, edit, or enhance explicitly requested PNG image assets with Codex built-in image generation. " +
      "Requires explicit user authorization and workspace-relative output paths.",
    promptSnippet:
      "Generate, edit, or enhance explicitly requested PNG image assets.",
    promptGuidelines: [
      "Call image_asset only for a user's explicit request to generate, edit, or enhance an image asset. Never infer an image task from unrelated design, code, or documentation work.",
      "For a clear request, call image_asset directly without IMAGE_ASSET_PROPOSAL. Edit and enhance must name the target image in the user's text; never infer a target from a recently opened, generated, or workspace-scanned image.",
      "When a clear single-image request omits output_paths, supply one automatic candidate: generate uses .image-gen/<semantic-name>.png; edit or enhance uses the explicit target's directory and <target-stem>-<semantic-suffix>.png. Preserve existing files: use a semantic suffix first, then numeric suffixes on collisions. Do not set overwrite for an automatic candidate.",
      "Ask a clarifying question when an edit/enhance target, visual request, or safe automatic candidate is absent. Use IMAGE_ASSET_PROPOSAL only when the request remains ambiguous and the user must approve a proposed exact request; include keys in this order: operation, prompt, target_path (if any), reference_path (if any), output_paths, overwrite, then require CONFIRM_IMAGE_ASSET.",
      "Use image_asset for asset creation or modification only. Use the existing read capability to analyze images; do not use this tool for visual inspection.",
    ],
    executionMode: "sequential",
    parameters: imageAssetSchema,
    async execute(
      _toolCallId,
      params,
      signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      try {
        const conversation = readImageAssetConversation(
          ctx.sessionManager.getBranch(),
        );
        const authorization = authorizeImageAssetCall(params, conversation);
        if (!authorization.authorized) throw authorizationError(authorization);

        const lastUser = [...conversation]
          .reverse()
          .find((message) => message.role === "user");
        const automaticOutput =
          authorization.mode === "direct" && lastUser
            ? automaticOutputKind(params, lastUser.text)
            : undefined;
        const requestInput =
          authorization.mode === "direct" && lastUser
            ? { ...params, prompt: lastUser.text }
            : params;
        const executeResolvedRequest = async (
          request: ResolvedImageAssetRequest,
        ) => {
          const finalPrompt = buildFinalImagePrompt(request);
          const result = await runImageAssetBatch(request, ctx.cwd, {
            runner,
            decoder,
            fileOperations: dependencies.fileOperations,
            signal: signal ?? ctx.signal,
          });
          const details: ImageAssetToolDetails = {
            status: "published",
            authorization: authorization.mode,
            operation: request.operation,
            finalPrompt,
            sources: {
              targetPath: request.targetPath ?? null,
              referencePath: request.referencePath ?? null,
            },
            outputPaths: result.outputPaths,
            outputs: result.outputs,
          };
          return {
            content: [
              { type: "text" as const, text: formatSuccessMessage(details) },
            ],
            details,
          };
        };
        if (automaticOutput) {
          const automaticPath = params.output_paths[0];
          if (!automaticPath) {
            throw new ImageAssetError(
              "invalid_request",
              "Automatic image output path is invalid.",
            );
          }
          return withOutputMutationQueues(
            [resolve(ctx.cwd, dirname(automaticPath))],
            async () =>
              executeResolvedRequest(
                await resolveAutomaticImageAssetRequest(
                  requestInput,
                  ctx.cwd,
                  automaticOutput,
                ),
              ),
          );
        }
        const request = await resolveAutomaticImageAssetRequest(
          requestInput,
          ctx.cwd,
          automaticOutput,
        );
        return withOutputMutationQueues(
          request.outputPaths.map(({ absolutePath }) => absolutePath),
          () => executeResolvedRequest(request),
        );
      } catch (error) {
        throw safeToolError(error);
      }
    },
  });
}

export default function myImageAsset(pi: ExtensionAPI): void {
  registerImageAssetTool(pi);
}
