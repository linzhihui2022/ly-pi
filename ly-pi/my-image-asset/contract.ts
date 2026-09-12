import { lstat, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

export const imageOperationSchema = StringEnum([
  "generate",
  "edit",
  "enhance",
] as const);
export type ImageOperation = Static<typeof imageOperationSchema>;

export const imageAssetSchema = Type.Object(
  {
    operation: imageOperationSchema,
    prompt: Type.String({ minLength: 1 }),
    target_path: Type.Optional(Type.String({ minLength: 1 })),
    reference_path: Type.Optional(Type.String({ minLength: 1 })),
    output_paths: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 4,
    }),
    overwrite: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ImageAssetRequest = Static<typeof imageAssetSchema>;

export type ImageAssetErrorCode =
  | "invalid_request"
  | "invalid_source"
  | "unsafe_path";

export class ImageAssetError extends Error {
  constructor(
    readonly code: ImageAssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageAssetError";
  }
}

export const IMAGE_ASSET_PROPOSAL_HEADER = "IMAGE_ASSET_PROPOSAL";
export const IMAGE_ASSET_CONFIRMATION = "CONFIRM_IMAGE_ASSET";

export interface ImageAssetConversationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export type ImageAssetAuthorization =
  | { readonly authorized: true; readonly mode: "direct" | "confirmed" }
  | {
      readonly authorized: false;
      readonly reason: "missing_explicit_request" | "confirmation_required";
    };

function requestFingerprint(request: ImageAssetRequest): string {
  return JSON.stringify({
    operation: request.operation,
    prompt: request.prompt.trim(),
    ...(request.target_path ? { target_path: request.target_path } : {}),
    ...(request.reference_path
      ? { reference_path: request.reference_path }
      : {}),
    output_paths: request.output_paths,
    overwrite: request.overwrite ?? false,
  });
}

export function formatImageAssetProposal(request: ImageAssetRequest): string {
  return [
    IMAGE_ASSET_PROPOSAL_HEADER,
    requestFingerprint(request),
    `Reply exactly ${IMAGE_ASSET_CONFIRMATION} to authorize this request.`,
  ].join("\n");
}

function hasExplicitImageIntent(
  text: string,
  operation: ImageOperation,
): boolean {
  const hasImageSubject =
    /(?:\bimage\b|\bpicture\b|\bphoto\b|\billustration\b|图片|图像|插画|照片|(?:生成|创建|制作|绘制|画)\s*(?:一张|一幅)|\.png\b|\.jpe?g\b|\.webp\b)/i.test(
      text,
    );
  const operationPattern: Record<ImageOperation, RegExp> = {
    generate:
      /(?:\bgenerate\b|\bcreate\b|\bmake\b|\bdraw\b|生成|创建|制作|绘制|画)/i,
    edit: /(?:\bedit\b|\bmodify\b|\bchange\b|编辑|修改|改图)/i,
    enhance:
      /(?:\benhance\b|\bimprove\b|\brestore\b|\brepair\b|增强|优化|修复|提升)/i,
  };
  const negatedOperationPattern: Record<ImageOperation, RegExp> = {
    generate:
      /(?:\b(?:do\s+not|don't|never)\s+(?:generate|create|make|draw)\b|(?:不要|别|不必|无需)\s*(?:生成|创建|制作|绘制|画))/i,
    edit: /(?:\b(?:do\s+not|don't|never)\s+(?:edit|modify|change)\b|(?:不要|别|不必|无需)\s*(?:编辑|修改|改图))/i,
    enhance:
      /(?:\b(?:do\s+not|don't|never)\s+(?:enhance|improve|restore|repair)\b|(?:不要|别|不必|无需)\s*(?:增强|优化|修复|提升))/i,
  };
  return (
    hasImageSubject &&
    operationPattern[operation].test(text) &&
    !negatedOperationPattern[operation].test(text)
  );
}

function hasSpecificEnhancementGoal(text: string): boolean {
  return /(?:清晰|锐化|噪点|降噪|纹理|曝光|色彩|颜色|对比|饱和|亮度|破损|划痕|背景|裁剪|透明|分辨率|restore|repair|denoise|texture|exposure|contrast|saturation|brightness|background|crop|resolution)/i.test(
    text,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATH_BOUNDARY =
  "(?:[\\s`\"'“”‘’()（）\\[\\]{}<>，,。；;：:]|\\.(?=\\s|$))";

function mentionsExactPath(text: string, path: string): boolean {
  return new RegExp(
    `(?:^|${PATH_BOUNDARY})${escapeRegExp(path)}(?=$|${PATH_BOUNDARY})`,
    "u",
  ).test(text);
}

function mentionsPaths(
  text: string,
  request: ImageAssetRequest,
  includeOutputs: boolean,
): boolean {
  const paths = [
    request.target_path,
    request.reference_path,
    ...(includeOutputs ? request.output_paths : []),
  ].filter((path): path is string => Boolean(path));
  return paths.every((path) => mentionsExactPath(text, path));
}

function hasExplicitOverwriteIntent(text: string): boolean {
  const hasOverwriteIntent = /(?:\boverwrite\b|覆盖)/i.test(text);
  const hasNegatedOverwriteIntent =
    /(?:\b(?:do\s+not|don't|never)\s+overwrite\b|\bwithout\s+overwrit(?:e|ing)\b|(?:不要|别|不必|无需|不)\s*覆盖)/i.test(
      text,
    );
  return hasOverwriteIntent && !hasNegatedOverwriteIntent;
}

export type AutomaticOutputKind = "generate" | "derived";

function mentionsUnboundImagePath(
  text: string,
  request: ImageAssetRequest,
): boolean {
  const withoutInputs = [request.target_path, request.reference_path]
    .filter((path): path is string => Boolean(path))
    .reduce((remaining, path) => remaining.replaceAll(path, ""), text);
  return /(?:^|[\s`"'“”‘’:(（])[-./\p{L}\p{N}_]+\.(?:png|jpe?g|webp)(?=$|[\s`"'“”‘’),，。；：）])/iu.test(
    withoutInputs,
  );
}

function isWorkspaceRelativeSourcePath(path: string): boolean {
  return !isAbsolute(path) && !path.split(/[\\/]/).includes("..");
}

function isAutomaticPngPath(path: string): boolean {
  return (
    extname(path).toLowerCase() === ".png" &&
    Boolean(basename(path, ".png").trim())
  );
}

export function automaticOutputKind(
  request: ImageAssetRequest,
  userText: string,
): AutomaticOutputKind | undefined {
  if (
    mentionsPaths(userText, request, true) ||
    mentionsUnboundImagePath(userText, request) ||
    request.output_paths.length !== 1 ||
    request.overwrite === true
  ) {
    return undefined;
  }

  const outputPath = request.output_paths[0];
  if (!outputPath || !isAutomaticPngPath(outputPath)) return undefined;
  if (request.operation === "generate") {
    return dirname(outputPath) === ".image-gen" ? "generate" : undefined;
  }

  const targetPath = request.target_path;
  if (!targetPath || !isWorkspaceRelativeSourcePath(targetPath)) {
    return undefined;
  }
  const targetStem = basename(targetPath, extname(targetPath));
  const outputStem = basename(outputPath, extname(outputPath));
  return dirname(outputPath) === dirname(targetPath) &&
    outputStem.startsWith(`${targetStem}-`) &&
    outputStem.length > targetStem.length + 1
    ? "derived"
    : undefined;
}

function isConfirmation(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized === IMAGE_ASSET_CONFIRMATION || normalized === "确认图片资产"
  );
}

export function authorizeImageAssetCall(
  request: ImageAssetRequest,
  messages: readonly ImageAssetConversationMessage[],
): ImageAssetAuthorization {
  const lastUserIndex = messages.reduce(
    (latest, message, index) => (message.role === "user" ? index : latest),
    -1,
  );
  const lastUser = messages[lastUserIndex];
  if (!lastUser) {
    return { authorized: false, reason: "missing_explicit_request" };
  }

  if (
    hasExplicitImageIntent(lastUser.text, request.operation) &&
    mentionsPaths(lastUser.text, request, false) &&
    (mentionsPaths(lastUser.text, request, true) ||
      automaticOutputKind(request, lastUser.text) !== undefined) &&
    (!request.overwrite || hasExplicitOverwriteIntent(lastUser.text)) &&
    (request.operation !== "enhance" ||
      hasSpecificEnhancementGoal(lastUser.text))
  ) {
    return { authorized: true, mode: "direct" };
  }

  if (!isConfirmation(lastUser.text)) {
    return { authorized: false, reason: "missing_explicit_request" };
  }

  const proposal = messages[lastUserIndex - 1];
  if (
    proposal?.role !== "assistant" ||
    !proposal.text.includes(formatImageAssetProposal(request))
  ) {
    return { authorized: false, reason: "confirmation_required" };
  }

  const hasOriginalRequest = messages
    .slice(0, lastUserIndex - 1)
    .some(
      (message) =>
        message.role === "user" &&
        hasExplicitImageIntent(message.text, request.operation) &&
        mentionsPaths(message.text, request, false),
    );
  return hasOriginalRequest
    ? { authorized: true, mode: "confirmed" }
    : { authorized: false, reason: "missing_explicit_request" };
}

export interface ResolvedImageOutput {
  readonly absolutePath: string;
  readonly relativePath: string;
}

declare const resolvedImageAssetRequestBrand: unique symbol;

export interface ResolvedImageAssetRequest {
  readonly [resolvedImageAssetRequestBrand]: true;
  readonly operation: ImageOperation;
  readonly prompt: string;
  readonly targetPath?: string;
  readonly referencePath?: string;
  readonly outputPaths: readonly ResolvedImageOutput[];
  readonly overwrite: boolean;
}

function isInsideWorkspace(workspace: string, target: string): boolean {
  const pathFromWorkspace = relative(workspace, target);
  return (
    pathFromWorkspace === "" ||
    (pathFromWorkspace !== ".." &&
      !pathFromWorkspace.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromWorkspace))
  );
}

export interface FinalImagePromptOptions {
  readonly includeOutputPaths?: boolean;
}

export function buildFinalImagePrompt(
  request: ResolvedImageAssetRequest,
  options: FinalImagePromptOptions = {},
): string {
  const lines = [
    `Primary request: ${request.prompt}`,
    `Operation: ${request.operation}`,
  ];
  if (request.targetPath) {
    lines.push(`Image target: ${basename(request.targetPath)}`);
  }
  if (request.referencePath) {
    lines.push(`Reference image: ${basename(request.referencePath)}`);
  }
  if (options.includeOutputPaths ?? true) {
    lines.push(
      `Output paths: ${request.outputPaths
        .map(({ relativePath }) => relativePath)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

async function resolveSourcePath(
  cwd: string,
  sourcePath: string,
): Promise<string> {
  try {
    const resolvedPath = await realpath(resolve(cwd, sourcePath));
    const stats = await lstat(resolvedPath);
    if (!stats.isFile()) {
      throw new ImageAssetError(
        "invalid_source",
        "Image source path must be a regular file.",
      );
    }
    return resolvedPath;
  } catch (error) {
    if (error instanceof ImageAssetError) throw error;
    throw new ImageAssetError(
      "invalid_source",
      "Image source path cannot be resolved.",
    );
  }
}

export async function resolveOutputPath(outputPath: string): Promise<string> {
  const segments: string[] = [];
  let ancestor = outputPath;

  while (true) {
    try {
      return resolve(await realpath(ancestor), ...segments.reverse());
    } catch {
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new ImageAssetError(
          "unsafe_path",
          "Image output must stay inside the workspace.",
        );
      }
      segments.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

export async function resolveImageAssetRequest(
  request: ImageAssetRequest,
  cwd: string,
): Promise<ResolvedImageAssetRequest> {
  if (
    !request.prompt.trim() ||
    request.output_paths.length < 1 ||
    request.output_paths.length > 4 ||
    (request.operation === "generate" &&
      (request.target_path || request.reference_path)) ||
    (request.operation !== "generate" && !request.target_path)
  ) {
    throw new ImageAssetError(
      "invalid_request",
      "Image asset request is invalid.",
    );
  }

  const workspace = await realpath(cwd);
  const targetPath = request.target_path
    ? await resolveSourcePath(workspace, request.target_path)
    : undefined;
  const referencePath = request.reference_path
    ? await resolveSourcePath(workspace, request.reference_path)
    : undefined;
  if (targetPath && referencePath && targetPath === referencePath) {
    throw new ImageAssetError(
      "invalid_request",
      "Image target and reference must be different files.",
    );
  }

  const outputPaths = await Promise.all(
    request.output_paths.map(async (relativePath) => {
      if (
        !relativePath.trim() ||
        isAbsolute(relativePath) ||
        extname(relativePath).toLowerCase() !== ".png"
      ) {
        throw new ImageAssetError(
          "invalid_request",
          "Image output path is invalid.",
        );
      }

      const lexicalPath = resolve(workspace, relativePath);
      if (!isInsideWorkspace(workspace, lexicalPath)) {
        throw new ImageAssetError(
          "unsafe_path",
          "Image output must stay inside the workspace.",
        );
      }

      const absolutePath = await resolveOutputPath(lexicalPath);
      if (!isInsideWorkspace(workspace, absolutePath)) {
        throw new ImageAssetError(
          "unsafe_path",
          "Image output must stay inside the workspace.",
        );
      }
      return { absolutePath, relativePath };
    }),
  );
  if (
    new Set(outputPaths.map(({ absolutePath }) => absolutePath)).size !==
    outputPaths.length
  ) {
    throw new ImageAssetError(
      "invalid_request",
      "Image output paths must be unique.",
    );
  }
  if (
    outputPaths.some(
      ({ absolutePath }) =>
        absolutePath === targetPath || absolutePath === referencePath,
    )
  ) {
    throw new ImageAssetError(
      "invalid_request",
      "Image output path cannot replace an input image.",
    );
  }

  return {
    operation: request.operation,
    prompt: request.prompt,
    targetPath,
    referencePath,
    outputPaths,
    overwrite: request.overwrite ?? false,
  } as unknown as ResolvedImageAssetRequest;
}
