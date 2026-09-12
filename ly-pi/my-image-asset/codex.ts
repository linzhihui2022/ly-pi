import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  ImageAssetBatchError,
  type ImageAssetRunner,
  type ImageDecoder,
  type ImageGenerationJob,
} from "./batch";

const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024;

export interface CodexProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CodexProcessExecutor {
  execute(
    command: string,
    args: readonly string[],
    options: { cwd: string; signal?: AbortSignal },
  ): Promise<CodexProcessResult>;
}

export interface CodexImageArtifactReader {
  read(path: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface CodexImageArtifactDirectoryLister {
  list(path: string, signal?: AbortSignal): Promise<readonly string[]>;
}

const localCodexImageArtifactReader: CodexImageArtifactReader = {
  read: (path, signal) => readFile(path, { signal }),
};

const localCodexImageArtifactDirectoryLister: CodexImageArtifactDirectoryLister =
  {
    list: (path) => readdir(path),
  };

const GENERATED_IMAGES_DIRECTORY_NAME = "generated_images";

function defaultGeneratedImagesDirectory(): string {
  const configuredHome = process.env.CODEX_HOME?.trim();
  const codexHome =
    configuredHome && configuredHome.length > 0
      ? configuredHome
      : join(homedir(), ".codex");
  return join(codexHome, GENERATED_IMAGES_DIRECTORY_NAME);
}

export interface CodexImageCommand {
  readonly command: "codex";
  readonly args: readonly string[];
}

function isRelativeToCwd(cwd: string, path: string): string | undefined {
  const relativePath = relative(cwd, path);
  return relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
    ? relativePath
    : undefined;
}

function lastMessagePath(stagedPath: string): string {
  const extension = extname(stagedPath);
  return `${stagedPath.slice(0, -extension.length)}.last.md`;
}

function buildCodexInstruction(job: ImageGenerationJob): string {
  const stagedPath = isRelativeToCwd(job.cwd, job.stagedPath);
  if (!stagedPath) {
    throw new ImageAssetBatchError(
      "generation_failed",
      "Image staging path is invalid.",
    );
  }

  const inputRoles = job.targetPath
    ? [
        `Image target: ${basename(job.targetPath)}`,
        ...(job.referencePath
          ? [`Reference image: ${basename(job.referencePath)}`]
          : []),
      ]
    : ["Input images: none"];

  return [
    "$imagegen",
    "Use Codex's built-in image_gen tool only.",
    "Do not use Python, SVG, HTML/CSS, canvas, or local drawing substitutes.",
    ...inputRoles,
    job.finalPrompt,
    `After a successful image_gen call, copy only the generated PNG artifact to ${JSON.stringify(stagedPath)} in the current workspace, then stop.`,
    "Run no other commands: do not build, test, lint, or touch any other file.",
    "If image_gen is unavailable or no image is generated, stop without creating a substitute.",
  ].join("\n");
}

export function buildCodexImageCommand(
  job: ImageGenerationJob,
): CodexImageCommand {
  const imageArguments = job.targetPath
    ? [
        "--image",
        job.targetPath,
        ...(job.referencePath ? ["--image", job.referencePath] : []),
      ]
    : [];

  return {
    command: "codex",
    args: [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--cd",
      job.cwd,
      "--sandbox",
      "workspace-write",
      ...imageArguments,
      "--json",
      "--output-last-message",
      lastMessagePath(job.stagedPath),
      buildCodexInstruction(job),
    ],
  };
}

function appendProcessOutput(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(-MAX_PROCESS_OUTPUT_BYTES);
}

export const localCodexProcessExecutor: CodexProcessExecutor = {
  async execute(command, args, options) {
    if (options.signal?.aborted) {
      throw new ImageAssetBatchError(
        "cancelled",
        "Image operation was cancelled.",
      );
    }

    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        child.kill();
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () =>
        options.signal?.removeEventListener("abort", onAbort);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendProcessOutput(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendProcessOutput(stderr, chunk);
      });
      child.once("error", (error) => {
        cleanup();
        if (aborted || options.signal?.aborted) {
          reject(
            new ImageAssetBatchError(
              "cancelled",
              "Image operation was cancelled.",
            ),
          );
          return;
        }
        reject(error);
      });
      child.once("close", (exitCode) => {
        cleanup();
        if (aborted || options.signal?.aborted) {
          reject(
            new ImageAssetBatchError(
              "cancelled",
              "Image operation was cancelled.",
            ),
          );
          return;
        }
        resolvePromise({ exitCode, stdout, stderr });
      });
    });
  },
};

function isTransientCodexFailure(stderr: string): boolean {
  return /(?:timeout|timed out|temporar|network|connect|tls|econnreset|eai_again|rate.?limit|\b429\b|\b5\d\d\b)/i.test(
    stderr,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function completedImageGenerationArtifactPath(
  item: Record<string, unknown>,
): string | undefined {
  if (item.status !== "completed" || typeof item.saved_path !== "string") {
    return undefined;
  }
  if (
    item.type === "image_generation" ||
    item.type === "image_generation_call"
  ) {
    return item.saved_path;
  }
  const toolName = item.name ?? item.tool_name ?? item.toolName ?? item.tool;
  return typeof toolName === "string" &&
    /^(?:image_gen|imagegen|image_gen__imagegen)$/i.test(toolName)
    ? item.saved_path
    : undefined;
}

function builtInImageGenerationArtifactPaths(stdout: string): string[] {
  const savedPaths: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (isRecord(event) && isRecord(event.item)) {
        const savedPath = completedImageGenerationArtifactPath(event.item);
        if (savedPath) savedPaths.push(savedPath);
      }
    } catch {}
  }
  return savedPaths;
}

function codexThreadId(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (
        isRecord(event) &&
        event.type === "thread.started" &&
        typeof event.thread_id === "string" &&
        isSafeArtifactSegment(event.thread_id)
      ) {
        return event.thread_id;
      }
    } catch {}
  }
  return undefined;
}

function isSafeArtifactSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes("\0")
  );
}

function digestArtifact(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function throwIfCodexAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ImageAssetBatchError(
      "cancelled",
      "Image operation was cancelled.",
    );
  }
}

async function pathsResolveToSameFile(
  firstPath: string,
  secondPath: string,
): Promise<boolean> {
  if (resolve(firstPath) === resolve(secondPath)) return true;
  try {
    return (await realpath(firstPath)) === (await realpath(secondPath));
  } catch {
    return false;
  }
}

interface CodexImageArtifactContext {
  readonly artifactReader: CodexImageArtifactReader;
  readonly directoryLister: CodexImageArtifactDirectoryLister;
  readonly generatedImagesDirectory: string;
}

interface CodexImageGenerationEvidence {
  readonly savedPaths: readonly string[];
  readonly threadId: string | undefined;
}

async function generatedImagesArtifactPaths(
  threadId: string | undefined,
  context: CodexImageArtifactContext,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  if (!threadId || !isSafeArtifactSegment(threadId)) return [];
  const directory = join(context.generatedImagesDirectory, threadId);
  let names: readonly string[];
  try {
    names = await context.directoryLister.list(directory, signal);
  } catch {
    throwIfCodexAborted(signal);
    return [];
  }
  throwIfCodexAborted(signal);
  return names
    .filter(
      (name) =>
        isSafeArtifactSegment(name) && extname(name).toLowerCase() === ".png",
    )
    .map((name) => join(directory, name));
}

async function verifyImageGenArtifact(
  evidence: CodexImageGenerationEvidence,
  stagedPath: string,
  context: CodexImageArtifactContext,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfCodexAborted(signal);
  let stagedDigest: string;
  try {
    stagedDigest = digestArtifact(
      await context.artifactReader.read(stagedPath, signal),
    );
  } catch {
    if (signal?.aborted) {
      throw new ImageAssetBatchError(
        "cancelled",
        "Image operation was cancelled.",
      );
    }
    throw new ImageAssetBatchError(
      "generation_failed",
      "Built-in image generation artifact could not be verified.",
    );
  }
  throwIfCodexAborted(signal);

  const candidates = [
    ...evidence.savedPaths.filter(
      (savedPath) => isAbsolute(savedPath) && !savedPath.includes("\0"),
    ),
    ...(await generatedImagesArtifactPaths(evidence.threadId, context, signal)),
  ];

  for (const candidate of candidates) {
    throwIfCodexAborted(signal);
    if (await pathsResolveToSameFile(candidate, stagedPath)) continue;
    try {
      if (
        digestArtifact(await context.artifactReader.read(candidate, signal)) ===
        stagedDigest
      ) {
        return;
      }
    } catch {
      if (signal?.aborted) {
        throw new ImageAssetBatchError(
          "cancelled",
          "Image operation was cancelled.",
        );
      }
    }
  }

  throw new ImageAssetBatchError(
    "generation_failed",
    "Generated image does not match the verified image_gen artifact.",
  );
}

export interface CodexImageRunnerOptions {
  readonly artifactDirectoryLister?: CodexImageArtifactDirectoryLister;
  readonly generatedImagesDirectory?: string;
}

export function createCodexImageRunner(
  executor: CodexProcessExecutor = localCodexProcessExecutor,
  artifactReader: CodexImageArtifactReader = localCodexImageArtifactReader,
  options: CodexImageRunnerOptions = {},
): ImageAssetRunner {
  const artifactContext: CodexImageArtifactContext = {
    artifactReader,
    directoryLister:
      options.artifactDirectoryLister ?? localCodexImageArtifactDirectoryLister,
    generatedImagesDirectory:
      options.generatedImagesDirectory ?? defaultGeneratedImagesDirectory(),
  };

  return {
    async run(job) {
      if (job.signal?.aborted) {
        throw new ImageAssetBatchError(
          "cancelled",
          "Image operation was cancelled.",
        );
      }

      let result: CodexProcessResult;
      try {
        const command = buildCodexImageCommand(job);
        result = await executor.execute(command.command, command.args, {
          cwd: job.cwd,
          signal: job.signal,
        });
      } catch (error) {
        if (error instanceof ImageAssetBatchError) throw error;
        throw new ImageAssetBatchError(
          "generation_failed",
          "Image generation failed.",
        );
      }

      if (job.signal?.aborted) {
        throw new ImageAssetBatchError(
          "cancelled",
          "Image operation was cancelled.",
        );
      }
      if (result.exitCode !== 0) {
        throw new ImageAssetBatchError(
          isTransientCodexFailure(result.stderr)
            ? "transient"
            : "generation_failed",
          isTransientCodexFailure(result.stderr)
            ? "Image generation was temporarily unavailable."
            : "Image generation failed.",
        );
      }
      const savedPaths = builtInImageGenerationArtifactPaths(result.stdout);
      const threadId = codexThreadId(result.stdout);
      if (savedPaths.length === 0 && !threadId) {
        throw new ImageAssetBatchError(
          "generation_failed",
          "Built-in image generation could not be verified.",
        );
      }
      await verifyImageGenArtifact(
        { savedPaths, threadId },
        job.stagedPath,
        artifactContext,
        job.signal,
      );
      throwIfCodexAborted(job.signal);
    },
  };
}

export function createSipsImageDecoder(
  executor: CodexProcessExecutor = localCodexProcessExecutor,
): ImageDecoder {
  return {
    async decode(path, signal) {
      if (signal?.aborted) {
        throw new ImageAssetBatchError(
          "cancelled",
          "Image operation was cancelled.",
        );
      }
      try {
        const result = await executor.execute("sips", ["-g", "format", path], {
          cwd: dirname(path),
          signal,
        });
        return result.exitCode === 0 && /format:\s*png/i.test(result.stdout);
      } catch (error) {
        if (
          error instanceof ImageAssetBatchError &&
          error.code === "cancelled"
        ) {
          throw error;
        }
        return false;
      }
    },
  };
}
