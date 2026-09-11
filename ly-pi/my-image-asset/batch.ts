import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  buildFinalImagePrompt,
  type ResolvedImageAssetRequest,
  type ResolvedImageOutput,
} from "./contract";

const STAGING_DIRECTORY_PREFIX = ".image-asset-stage-";
const PUBLICATION_JOURNAL_FILE = ".image-asset-publish.json";

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

export interface ImageAssetFileStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface ImageAssetFileOperations {
  lstat(path: string): Promise<ImageAssetFileStat>;
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
    readonly preserveStaging = false,
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

interface PublicationJournalEntry {
  readonly relativePath: string;
  readonly stagedFileName: string;
  readonly backupFileName: string;
  readonly hadExistingOutput: boolean;
}

interface PublicationJournal {
  readonly version: 1;
  readonly state: "publishing" | "committed";
  readonly publications: readonly PublicationJournalEntry[];
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
  retryStagedPath: string,
): Promise<string> {
  throwIfAborted(job.signal);
  try {
    await runner.run(job);
    return job.stagedPath;
  } catch (error) {
    const failure = asGenerationFailure(error);
    if (failure.code !== "transient") throw failure;
  }

  throwIfAborted(job.signal);
  try {
    await runner.run({ ...job, stagedPath: retryStagedPath });
    return retryStagedPath;
  } catch (error) {
    throw asGenerationFailure(error);
  }
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

function isMissingPath(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function ensureSafeOutputParent(
  outputPath: string,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<void> {
  const missingSegments: string[] = [];
  let ancestor = dirname(outputPath);

  while (true) {
    try {
      const canonicalAncestor = await realpath(ancestor);
      if (!isInsideWorkspace(workspace, canonicalAncestor)) {
        throw new Error("Image output parent escaped the workspace.");
      }
      const parent = resolve(
        canonicalAncestor,
        ...[...missingSegments].reverse(),
      );
      await fileOperations.mkdir(parent, { recursive: true });
      const canonicalParent = await realpath(parent);
      if (!isInsideWorkspace(workspace, canonicalParent)) {
        throw new Error("Image output parent escaped the workspace.");
      }
      return;
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new Error("Image output parent could not be resolved.");
      }
      missingSegments.push(basename(ancestor));
      ancestor = parent;
    }
  }
}

async function assertSafeStagingDirectory(
  stagingDirectory: string,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<string> {
  try {
    const stats = await fileOperations.lstat(stagingDirectory);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error("Image staging directory is not a directory.");
    }
    const canonicalStagingDirectory = await realpath(stagingDirectory);
    if (!isInsideWorkspace(workspace, canonicalStagingDirectory)) {
      throw new Error("Image staging directory escaped the workspace.");
    }
    return canonicalStagingDirectory;
  } catch {
    throw new ImageAssetBatchError(
      "invalid_output",
      "Image staging directory is not safe.",
    );
  }
}

async function assertSafePublicationTarget(
  output: ResolvedImageOutput,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<void> {
  try {
    if (!isInsideWorkspace(workspace, output.absolutePath)) {
      throw new Error("Image output escaped the workspace.");
    }
    await ensureSafeOutputParent(
      output.absolutePath,
      workspace,
      fileOperations,
    );
    try {
      const stats = await fileOperations.lstat(output.absolutePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error("Image output is not a regular file.");
      }
    } catch (error) {
      if (isMissingPath(error)) return;
      throw error;
    }
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image output path could not be safely published.",
    );
  }
}

async function assertSafeStagedFile(
  path: string,
  stagingDirectory: string,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<void> {
  try {
    const canonicalStagingDirectory = await assertSafeStagingDirectory(
      stagingDirectory,
      workspace,
      fileOperations,
    );
    if ((await realpath(dirname(path))) !== canonicalStagingDirectory) {
      throw new Error("Image output left the staging directory.");
    }
    const stats = await fileOperations.lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("Staged output is not a regular file.");
    }
  } catch {
    throw new ImageAssetBatchError(
      "invalid_output",
      "Generated image is not a safe regular file.",
    );
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
    if (isMissingPath(error)) return false;
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image output path could not be inspected.",
    );
  }
}

function createPublicationJournal(
  publications: readonly Publication[],
  existingOutputs: readonly boolean[],
  state: PublicationJournal["state"] = "publishing",
): PublicationJournal {
  return {
    version: 1,
    state,
    publications: publications.map((publication, index) => ({
      relativePath: publication.output.relativePath,
      stagedFileName: basename(publication.stagedPath),
      backupFileName: `backup-${index}.png`,
      hadExistingOutput: existingOutputs[index] ?? false,
    })),
  };
}

function publicationJournalPath(stagingDirectory: string): string {
  return join(stagingDirectory, PUBLICATION_JOURNAL_FILE);
}

async function writePublicationJournal(
  stagingDirectory: string,
  journal: PublicationJournal,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<void> {
  await assertSafeStagingDirectory(stagingDirectory, workspace, fileOperations);
  const path = publicationJournalPath(stagingDirectory);
  const temporaryPath = `${path}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(journal));
    await rename(temporaryPath, path);
  } catch {
    await rm(temporaryPath, { force: true, recursive: false }).catch(() => {});
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recorded.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPublicationJournal(value: unknown): value is PublicationJournal {
  if (!isRecord(value) || value.version !== 1) return false;
  if (value.state !== "publishing" && value.state !== "committed") return false;
  return (
    Array.isArray(value.publications) &&
    value.publications.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.relativePath === "string" &&
        typeof entry.stagedFileName === "string" &&
        typeof entry.backupFileName === "string" &&
        typeof entry.hadExistingOutput === "boolean",
    )
  );
}

async function readPublicationJournal(
  stagingDirectory: string,
): Promise<PublicationJournal | undefined> {
  let serialized: string;
  try {
    serialized = await readFile(
      publicationJournalPath(stagingDirectory),
      "utf8",
    );
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }

  try {
    const journal: unknown = JSON.parse(serialized);
    if (!isPublicationJournal(journal)) throw new Error("Invalid journal.");
    return journal;
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
}

function outputFromJournal(
  workspace: string,
  entry: PublicationJournalEntry,
): ResolvedImageOutput {
  if (
    !entry.relativePath ||
    isAbsolute(entry.relativePath) ||
    basename(entry.stagedFileName) !== entry.stagedFileName ||
    basename(entry.backupFileName) !== entry.backupFileName
  ) {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
  const absolutePath = resolve(workspace, entry.relativePath);
  if (!isInsideWorkspace(workspace, absolutePath)) {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
  return { absolutePath, relativePath: entry.relativePath };
}

async function restorePublications(
  publications: readonly Publication[],
  stagingDirectory: string,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
): Promise<boolean> {
  let restored = true;
  for (const publication of [...publications].reverse()) {
    try {
      await assertSafePublicationTarget(
        publication.output,
        workspace,
        fileOperations,
      );
      if (publication.published) {
        await fileOperations.rm(publication.output.absolutePath, {
          force: true,
          recursive: false,
        });
      }
      if (
        publication.backupPath &&
        (await pathExists(publication.backupPath, fileOperations))
      ) {
        await assertSafeStagedFile(
          publication.backupPath,
          stagingDirectory,
          workspace,
          fileOperations,
        );
        await fileOperations.rename(
          publication.backupPath,
          publication.output.absolutePath,
        );
      }
    } catch {
      restored = false;
    }
  }
  return restored;
}

async function recoverInterruptedPublication(
  stagingDirectory: string,
  journal: PublicationJournal,
  workspace: string,
): Promise<boolean> {
  await assertSafeStagingDirectory(
    stagingDirectory,
    workspace,
    nodeFileOperations,
  );
  const publications: Publication[] = [];
  for (const entry of journal.publications) {
    const output = outputFromJournal(workspace, entry);
    const stagedPath = join(stagingDirectory, entry.stagedFileName);
    const backupPath = join(stagingDirectory, entry.backupFileName);
    const hasBackup =
      entry.hadExistingOutput &&
      (await pathExists(backupPath, nodeFileOperations));
    const hasStagedOutput = await pathExists(stagedPath, nodeFileOperations);
    publications.push({
      output,
      stagedPath,
      backupPath: hasBackup ? backupPath : undefined,
      published: hasBackup || (!entry.hadExistingOutput && !hasStagedOutput),
    });
  }
  return restorePublications(
    publications,
    stagingDirectory,
    workspace,
    nodeFileOperations,
  );
}

async function recoverInterruptedPublications(
  workspace: string,
): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(workspace, { withFileTypes: true });
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
    );
  }

  for (const entry of entries) {
    if (
      !entry.name.startsWith(STAGING_DIRECTORY_PREFIX) ||
      !entry.isDirectory()
    ) {
      continue;
    }
    const stagingDirectory = join(workspace, entry.name);
    await assertSafeStagingDirectory(
      stagingDirectory,
      workspace,
      nodeFileOperations,
    );
    const journal = await readPublicationJournal(stagingDirectory);
    if (!journal) continue;
    if (journal.state === "committed") {
      try {
        await rm(stagingDirectory, { force: true, recursive: true });
      } catch {
        throw new ImageAssetBatchError(
          "publish_failed",
          "Image publication state could not be recovered.",
        );
      }
      continue;
    }

    const restored = await recoverInterruptedPublication(
      stagingDirectory,
      journal,
      workspace,
    );
    if (!restored) {
      throw new ImageAssetBatchError(
        "publish_failed",
        "Image assets could not be restored after an interrupted publication.",
        true,
      );
    }
    try {
      await rm(stagingDirectory, { force: true, recursive: true });
    } catch {
      throw new ImageAssetBatchError(
        "publish_failed",
        "Image publication state could not be recovered.",
      );
    }
  }
}

async function publishStagedOutputs(
  publications: Publication[],
  existingOutputs: readonly boolean[],
  stagingDirectory: string,
  workspace: string,
  fileOperations: ImageAssetFileOperations,
  signal: AbortSignal | undefined,
): Promise<void> {
  const journal = createPublicationJournal(publications, existingOutputs);
  await writePublicationJournal(
    stagingDirectory,
    journal,
    workspace,
    fileOperations,
  );

  try {
    for (const [index, publication] of publications.entries()) {
      throwIfAborted(signal);
      await assertSafePublicationTarget(
        publication.output,
        workspace,
        fileOperations,
      );
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
      await assertSafePublicationTarget(
        publication.output,
        workspace,
        fileOperations,
      );
      await assertSafeStagedFile(
        publication.stagedPath,
        stagingDirectory,
        workspace,
        fileOperations,
      );
      await fileOperations.rename(
        publication.stagedPath,
        publication.output.absolutePath,
      );
      publication.published = true;
    }
    await writePublicationJournal(
      stagingDirectory,
      { ...journal, state: "committed" },
      workspace,
      fileOperations,
    );
  } catch (error) {
    const restored = await restorePublications(
      publications,
      stagingDirectory,
      workspace,
      fileOperations,
    );
    if (!restored) {
      throw new ImageAssetBatchError(
        "publish_failed",
        "Image assets could not be restored after publishing failed.",
        true,
      );
    }
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
  const workspace = await realpath(cwd);
  await recoverInterruptedPublications(workspace);
  throwIfAborted(dependencies.signal);

  const initialExistingOutputs = await Promise.all(
    request.outputPaths.map(({ absolutePath }) =>
      pathExists(absolutePath, fileOperations),
    ),
  );
  if (!request.overwrite && initialExistingOutputs.some(Boolean)) {
    throw new ImageAssetBatchError(
      "output_exists",
      "An image output path already exists.",
    );
  }

  const stagingDirectory = await fileOperations.mkdtemp(
    join(workspace, STAGING_DIRECTORY_PREFIX),
  );
  const finalPrompt = buildFinalImagePrompt(request);
  let preserveStaging = false;

  try {
    const publications: Publication[] = [];
    for (const [index, output] of request.outputPaths.entries()) {
      throwIfAborted(dependencies.signal);
      const initialStagedPath = join(stagingDirectory, `${index}.png`);
      const stagedPath = await runWithSingleTransientRetry(
        dependencies.runner,
        {
          cwd,
          finalPrompt,
          output,
          stagedPath: initialStagedPath,
          targetPath: request.targetPath,
          referencePath: request.referencePath,
          signal: dependencies.signal,
        },
        join(stagingDirectory, `${index}-retry.png`),
      );

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
      await assertSafeStagedFile(
        stagedPath,
        stagingDirectory,
        workspace,
        fileOperations,
      );
      publications.push({ output, stagedPath, published: false });
    }

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
    await Promise.all(
      publications.map(({ output }) =>
        assertSafePublicationTarget(output, workspace, fileOperations),
      ),
    );
    await publishStagedOutputs(
      publications,
      existingOutputs,
      stagingDirectory,
      workspace,
      fileOperations,
      dependencies.signal,
    );
    return {
      outputPaths: request.outputPaths.map(({ relativePath }) => relativePath),
    };
  } catch (error) {
    preserveStaging =
      error instanceof ImageAssetBatchError && error.preserveStaging;
    throw error;
  } finally {
    if (!preserveStaging) {
      await fileOperations
        .rm(stagingDirectory, { force: true, recursive: true })
        .catch(() => {});
    }
  }
}
