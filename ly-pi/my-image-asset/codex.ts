import { spawn } from "node:child_process";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
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
    `After a successful image_gen call, copy only the generated PNG artifact to ${JSON.stringify(stagedPath)} in the current workspace.`,
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

export function createCodexImageRunner(
  executor: CodexProcessExecutor = localCodexProcessExecutor,
): ImageAssetRunner {
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
