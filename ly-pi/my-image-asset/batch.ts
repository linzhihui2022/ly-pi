import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildFinalImagePrompt,
  type ResolvedImageAssetRequest,
  type ResolvedImageOutput,
} from "./contract";

export interface ImageGenerationJob {
  readonly cwd: string;
  readonly finalPrompt: string;
  readonly output: ResolvedImageOutput;
  readonly stagedPath: string;
  readonly targetPath?: string;
  readonly referencePath?: string;
  readonly signal?: AbortSignal;
}

export interface ImageAssetRunner {
  run(job: ImageGenerationJob): Promise<void>;
}

export interface ImageDecoder {
  decode(path: string, signal?: AbortSignal): Promise<boolean>;
}

export interface ImageAssetFileOperations {
  lstat(path: string): Promise<unknown>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(
    path: string,
    options: { force: boolean; recursive: boolean },
  ): Promise<void>;
}

const nodeFileOperations: ImageAssetFileOperations = {
  lstat: (path) => lstat(path),
  mkdir: (path, options) => mkdir(path, options),
  mkdtemp: (prefix) => mkdtemp(prefix),
  rename: (from, to) => rename(from, to),
  rm: (path, options) => rm(path, options),
};

export type ImageAssetBatchErrorCode =
  | "cancelled"
  | "generation_failed"
  | "invalid_output"
  | "output_exists"
  | "publish_failed"
  | "transient";

export class ImageAssetBatchError extends Error {
  constructor(
    readonly code: ImageAssetBatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageAssetBatchError";
  }
}

export interface ImageAssetBatchResult {
  readonly outputPaths: readonly string[];
}

export interface ImageAssetBatchDependencies {
  readonly runner: ImageAssetRunner;
  readonly decoder: ImageDecoder;
  readonly fileOperations?: ImageAssetFileOperations;
  readonly signal?: AbortSignal;
}

interface Publication {
  readonly output: ResolvedImageOutput;
  readonly stagedPath: string;
  backupPath?: string;
  published: boolean;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ImageAssetBatchError(
      "cancelled",
      "Image operation was cancelled.",
    );
  }
}

function asGenerationFailure(error: unknown): ImageAssetBatchError {
  return error instanceof ImageAssetBatchError
    ? error
    : new ImageAssetBatchError("generation_failed", "Image generation failed.");
}

async function runWithSingleTransientRetry(
  runner: ImageAssetRunner,
  job: ImageGenerationJob,
): Promise<void> {
  throwIfAborted(job.signal);
  try {
    await runner.run(job);
    return;
  } catch (error) {
    const failure = asGenerationFailure(error);
    if (failure.code !== "transient") throw failure;
  }

  throwIfAborted(job.signal);
  try {
    await runner.run(job);
  } catch (error) {
    throw asGenerationFailure(error);
  }
}

async function pathExists(
  path: string,
  fileOperations: ImageAssetFileOperations,
): Promise<boolean> {
  try {
    await fileOperations.lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image output path could not be inspected.",
    );
  }
}

async function restorePublications(
  publications: readonly Publication[],
  fileOperations: ImageAssetFileOperations,
): Promise<void> {
  try {
    for (const publication of [...publications].reverse()) {
      if (publication.published) {
        await fileOperations.rm(publication.output.absolutePath, {
          force: true,
          recursive: false,
        });
      }
      if (publication.backupPath) {
        await fileOperations.mkdir(dirname(publication.output.absolutePath), {
          recursive: true,
        });
        await fileOperations.rename(
          publication.backupPath,
          publication.output.absolutePath,
        );
      }
    }
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image assets could not be restored after publishing failed.",
    );
  }
}

async function publishStagedOutputs(
  publications: Publication[],
  existingOutputs: readonly boolean[],
  stagingDirectory: string,
  fileOperations: ImageAssetFileOperations,
  signal: AbortSignal | undefined,
): Promise<void> {
  try {
    for (const [index, publication] of publications.entries()) {
      throwIfAborted(signal);
      await fileOperations.mkdir(dirname(publication.output.absolutePath), {
        recursive: true,
      });
      if (existingOutputs[index]) {
        publication.backupPath = join(stagingDirectory, `backup-${index}.png`);
        await fileOperations.rename(
          publication.output.absolutePath,
          publication.backupPath,
        );
      }
    }

    for (const publication of publications) {
      throwIfAborted(signal);
      await fileOperations.rename(
        publication.stagedPath,
        publication.output.absolutePath,
      );
      publication.published = true;
    }
  } catch (error) {
    await restorePublications(publications, fileOperations);
    if (error instanceof ImageAssetBatchError && error.code === "cancelled") {
      throw error;
    }
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image assets could not be published.",
    );
  }
}

export async function runImageAssetBatch(
  request: ResolvedImageAssetRequest,
  cwd: string,
  dependencies: ImageAssetBatchDependencies,
): Promise<ImageAssetBatchResult> {
  const fileOperations = dependencies.fileOperations ?? nodeFileOperations;
  throwIfAborted(dependencies.signal);

  const existingOutputs = await Promise.all(
    request.outputPaths.map(({ absolutePath }) =>
      pathExists(absolutePath, fileOperations),
    ),
  );
  if (!request.overwrite && existingOutputs.some(Boolean)) {
    throw new ImageAssetBatchError(
      "output_exists",
      "An image output path already exists.",
    );
  }

  const stagingDirectory = await fileOperations.mkdtemp(
    join(cwd, ".image-asset-stage-"),
  );
  const finalPrompt = buildFinalImagePrompt(request);

  try {
    const publications: Publication[] = [];
    for (const [index, output] of request.outputPaths.entries()) {
      throwIfAborted(dependencies.signal);
      const stagedPath = join(stagingDirectory, `${index}.png`);
      await runWithSingleTransientRetry(dependencies.runner, {
        cwd,
        finalPrompt,
        output,
        stagedPath,
        targetPath: request.targetPath,
        referencePath: request.referencePath,
        signal: dependencies.signal,
      });

      let decodable = false;
      try {
        decodable = await dependencies.decoder.decode(
          stagedPath,
          dependencies.signal,
        );
      } catch (error) {
        if (
          error instanceof ImageAssetBatchError &&
          error.code === "cancelled"
        ) {
          throw error;
        }
        throw new ImageAssetBatchError(
          "invalid_output",
          "Generated image is not decodable.",
        );
      }
      if (!decodable) {
        throw new ImageAssetBatchError(
          "invalid_output",
          "Generated image is not decodable.",
        );
      }
      publications.push({ output, stagedPath, published: false });
    }

    await publishStagedOutputs(
      publications,
      existingOutputs,
      stagingDirectory,
      fileOperations,
      dependencies.signal,
    );
    return {
      outputPaths: request.outputPaths.map(({ relativePath }) => relativePath),
    };
  } finally {
    await fileOperations.rm(stagingDirectory, { force: true, recursive: true });
  }
}
