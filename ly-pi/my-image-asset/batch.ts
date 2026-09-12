import { randomUUID } from "node:crypto";
import {
  link,
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
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  buildFinalImagePrompt,
  ImageAssetError,
  type ResolvedImageAssetRequest,
  type ResolvedImageOutput,
  resolveOutputPath,
} from "./contract";

const STAGING_DIRECTORY_PREFIX = ".image-asset-stage-";
const PUBLICATION_JOURNAL_FILE = ".image-asset-publish.json";
const PUBLICATION_JOURNAL_VERSION = 2;

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
  readonly dev?: number;
  readonly ino?: number;
}

export interface ImageAssetFileOperations {
  lstat(path: string): Promise<ImageAssetFileStat>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  link(from: string, to: string): Promise<void>;
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
  link: (from, to) => link(from, to),
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

export interface ImageAssetOutputResult {
  readonly path: string;
  readonly status: "published";
}

export interface ImageAssetBatchResult {
  readonly outputPaths: readonly string[];
  readonly outputs: readonly ImageAssetOutputResult[];
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
  readonly published: boolean;
}

interface PublicationJournal {
  readonly version: 2;
  readonly stagingDirectoryName: string;
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

function isExistingPath(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}

async function pathsShareFile(
  firstPath: string,
  secondPath: string,
  fileOperations: ImageAssetFileOperations,
): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([
      fileOperations.lstat(firstPath),
      fileOperations.lstat(secondPath),
    ]);
    return (
      first.isFile() &&
      second.isFile() &&
      !first.isSymbolicLink() &&
      !second.isSymbolicLink() &&
      typeof first.dev === "number" &&
      typeof second.dev === "number" &&
      typeof first.ino === "number" &&
      typeof second.ino === "number" &&
      first.dev === second.dev &&
      first.ino === second.ino
    );
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be inspected.",
      true,
    );
  }
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
  stagingDirectory: string,
  workspace: string,
  publications: readonly Publication[],
  existingOutputs: readonly boolean[],
  state: PublicationJournal["state"] = "publishing",
): PublicationJournal {
  return {
    version: PUBLICATION_JOURNAL_VERSION,
    stagingDirectoryName: basename(stagingDirectory),
    state,
    publications: publications.map((publication, index) => ({
      relativePath: relative(workspace, publication.output.absolutePath),
      stagedFileName: basename(publication.stagedPath),
      backupFileName: `backup-${index}.png`,
      hadExistingOutput: existingOutputs[index] ?? false,
      published: publication.published,
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
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(journal), { flag: "wx" });
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

function throwInvalidResolvedRequest(): never {
  throw new ImageAssetError(
    "invalid_request",
    "Image asset request is invalid.",
  );
}

async function assertResolvedImageAssetRequest(
  request: unknown,
  workspace: string,
): Promise<void> {
  if (!isRecord(request)) throwInvalidResolvedRequest();
  const operation = request.operation;
  if (
    operation !== "generate" &&
    operation !== "edit" &&
    operation !== "enhance"
  ) {
    throwInvalidResolvedRequest();
  }
  if (
    typeof request.prompt !== "string" ||
    !request.prompt.trim() ||
    typeof request.overwrite !== "boolean" ||
    !Array.isArray(request.outputPaths) ||
    request.outputPaths.length < 1 ||
    request.outputPaths.length > 4
  ) {
    throwInvalidResolvedRequest();
  }

  const targetPath = request.targetPath;
  const referencePath = request.referencePath;
  if (
    (targetPath !== undefined && typeof targetPath !== "string") ||
    (referencePath !== undefined && typeof referencePath !== "string") ||
    (operation === "generate" &&
      (targetPath !== undefined || referencePath !== undefined)) ||
    (operation !== "generate" &&
      (typeof targetPath !== "string" || !targetPath))
  ) {
    throwInvalidResolvedRequest();
  }

  const sourcePaths: string[] = [];
  for (const sourcePath of [targetPath, referencePath]) {
    if (sourcePath === undefined) continue;
    if (!isAbsolute(sourcePath)) throwInvalidResolvedRequest();
    try {
      const stats = await lstat(sourcePath);
      const canonicalPath = await realpath(sourcePath);
      if (
        stats.isSymbolicLink() ||
        !stats.isFile() ||
        canonicalPath !== sourcePath
      ) {
        throwInvalidResolvedRequest();
      }
      sourcePaths.push(canonicalPath);
    } catch (error) {
      if (error instanceof ImageAssetError) throw error;
      throwInvalidResolvedRequest();
    }
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    throwInvalidResolvedRequest();
  }

  const absolutePaths = new Set<string>();
  for (const output of request.outputPaths) {
    if (!isRecord(output)) throwInvalidResolvedRequest();
    if (
      typeof output.absolutePath !== "string" ||
      typeof output.relativePath !== "string" ||
      !output.relativePath.trim() ||
      isAbsolute(output.relativePath) ||
      extname(output.relativePath).toLowerCase() !== ".png" ||
      !isAbsolute(output.absolutePath) ||
      !isInsideWorkspace(workspace, output.absolutePath) ||
      absolutePaths.has(output.absolutePath) ||
      sourcePaths.includes(output.absolutePath) ||
      output.relativePath.includes("\0") ||
      output.absolutePath.includes("\0")
    ) {
      throwInvalidResolvedRequest();
    }
    let canonicalOutputPath: string;
    try {
      canonicalOutputPath = await resolveOutputPath(
        resolve(workspace, output.relativePath),
      );
    } catch {
      throwInvalidResolvedRequest();
    }
    if (canonicalOutputPath !== output.absolutePath) {
      throwInvalidResolvedRequest();
    }
    absolutePaths.add(output.absolutePath);
  }
}

function isSafeJournalRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\0") &&
    !isAbsolute(path) &&
    extname(path).toLowerCase() === ".png"
  );
}

function isPublicationJournal(
  value: unknown,
  stagingDirectory: string,
): value is PublicationJournal {
  if (!isRecord(value) || value.version !== PUBLICATION_JOURNAL_VERSION) {
    return false;
  }
  if (
    typeof value.stagingDirectoryName !== "string" ||
    value.stagingDirectoryName !== basename(value.stagingDirectoryName) ||
    !value.stagingDirectoryName.startsWith(STAGING_DIRECTORY_PREFIX) ||
    value.stagingDirectoryName !== basename(stagingDirectory)
  ) {
    return false;
  }
  if (value.state !== "publishing" && value.state !== "committed") {
    return false;
  }
  if (!Array.isArray(value.publications) || value.publications.length > 4) {
    return false;
  }
  const relativePaths = value.publications.map((entry) =>
    isRecord(entry) && typeof entry.relativePath === "string"
      ? entry.relativePath
      : "",
  );
  return (
    new Set(relativePaths).size === relativePaths.length &&
    value.publications.every(
      (entry, index) =>
        isRecord(entry) &&
        typeof entry.relativePath === "string" &&
        isSafeJournalRelativePath(entry.relativePath) &&
        (entry.stagedFileName === `${index}.png` ||
          entry.stagedFileName === `${index}-retry.png`) &&
        entry.backupFileName === `backup-${index}.png` &&
        typeof entry.hadExistingOutput === "boolean" &&
        typeof entry.published === "boolean",
    )
  );
}

async function readPublicationJournal(
  stagingDirectory: string,
): Promise<PublicationJournal | undefined> {
  let serialized: string;
  try {
    const path = publicationJournalPath(stagingDirectory);
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("Invalid publication journal file.");
    }
    serialized = await readFile(path, "utf8");
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
    if (!isPublicationJournal(journal, stagingDirectory)) {
      throw new Error("Invalid journal.");
    }
    return journal;
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
}

async function outputFromJournal(
  workspace: string,
  entry: PublicationJournalEntry,
): Promise<ResolvedImageOutput> {
  let absolutePath: string;
  try {
    absolutePath = await resolveOutputPath(
      resolve(workspace, entry.relativePath),
    );
  } catch {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
  if (!isInsideWorkspace(workspace, absolutePath)) {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image publication state could not be recovered.",
      true,
    );
  }
  return {
    absolutePath,
    relativePath: relative(workspace, absolutePath),
  };
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
    const output = await outputFromJournal(workspace, entry);
    const stagedPath = join(stagingDirectory, entry.stagedFileName);
    const backupPath = join(stagingDirectory, entry.backupFileName);
    const hasBackup =
      entry.hadExistingOutput &&
      (await pathExists(backupPath, nodeFileOperations));
    const hasStagedOutput = await pathExists(stagedPath, nodeFileOperations);
    const hasOutput =
      !entry.hadExistingOutput &&
      (await pathExists(output.absolutePath, nodeFileOperations));
    const publishedViaHardLink =
      !entry.hadExistingOutput &&
      hasStagedOutput &&
      hasOutput &&
      (await pathsShareFile(
        stagedPath,
        output.absolutePath,
        nodeFileOperations,
      ));
    if (
      (!entry.published && !hasBackup && !hasStagedOutput) ||
      (entry.published && entry.hadExistingOutput && !hasBackup) ||
      (entry.published && !entry.hadExistingOutput && !publishedViaHardLink) ||
      (!entry.published &&
        !entry.hadExistingOutput &&
        hasOutput &&
        !publishedViaHardLink)
    ) {
      return false;
    }
    publications.push({
      output,
      stagedPath,
      backupPath: hasBackup ? backupPath : undefined,
      published: entry.published || publishedViaHardLink,
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
    if (!journal) {
      let orphanEntries: string[];
      try {
        orphanEntries = await readdir(stagingDirectory);
      } catch {
        throw new ImageAssetBatchError(
          "publish_failed",
          "Image publication state could not be recovered.",
          true,
        );
      }
      if (orphanEntries.length === 0) {
        try {
          await rm(stagingDirectory, { force: true, recursive: true });
        } catch {
          throw new ImageAssetBatchError(
            "publish_failed",
            "Image publication state could not be recovered.",
            true,
          );
        }
        continue;
      }
      throw new ImageAssetBatchError(
        "publish_failed",
        "Unrecognized image staging files require manual cleanup.",
        true,
      );
    }
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
  const journal = createPublicationJournal(
    stagingDirectory,
    workspace,
    publications,
    existingOutputs,
  );
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

    for (const [index, publication] of publications.entries()) {
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
      if (existingOutputs[index]) {
        await fileOperations.rename(
          publication.stagedPath,
          publication.output.absolutePath,
        );
        publication.published = true;
      } else {
        try {
          await fileOperations.link(
            publication.stagedPath,
            publication.output.absolutePath,
          );
        } catch (error) {
          if (isExistingPath(error)) {
            throw new ImageAssetBatchError(
              "output_exists",
              "An image output path already exists.",
            );
          }
          throw error;
        }
        publication.published = true;
      }
      await writePublicationJournal(
        stagingDirectory,
        createPublicationJournal(
          stagingDirectory,
          workspace,
          publications,
          existingOutputs,
        ),
        workspace,
        fileOperations,
      );
    }
    await writePublicationJournal(
      stagingDirectory,
      createPublicationJournal(
        stagingDirectory,
        workspace,
        publications,
        existingOutputs,
        "committed",
      ),
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
    if (
      error instanceof ImageAssetBatchError &&
      (error.code === "cancelled" || error.code === "output_exists")
    ) {
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
  await assertResolvedImageAssetRequest(request, workspace);
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
  const generationPrompt = buildFinalImagePrompt(request, {
    includeOutputPaths: false,
  });
  let preserveStaging = false;
  let primaryError: unknown;
  let failed = false;
  let result: ImageAssetBatchResult | undefined;

  try {
    await writePublicationJournal(
      stagingDirectory,
      createPublicationJournal(stagingDirectory, workspace, [], []),
      workspace,
      fileOperations,
    );
    const publications: Publication[] = [];
    for (const [index, output] of request.outputPaths.entries()) {
      throwIfAborted(dependencies.signal);
      const initialStagedPath = join(stagingDirectory, `${index}.png`);
      const stagedPath = await runWithSingleTransientRetry(
        dependencies.runner,
        {
          cwd: workspace,
          finalPrompt: generationPrompt,
          output,
          stagedPath: initialStagedPath,
          targetPath: request.targetPath,
          referencePath: request.referencePath,
          signal: dependencies.signal,
        },
        join(stagingDirectory, `${index}-retry.png`),
      );

      throwIfAborted(dependencies.signal);
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
        throwIfAborted(dependencies.signal);
        throw new ImageAssetBatchError(
          "invalid_output",
          "Generated image is not decodable.",
        );
      }
      throwIfAborted(dependencies.signal);
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
    result = {
      outputPaths: request.outputPaths.map(({ relativePath }) => relativePath),
      outputs: request.outputPaths.map(({ relativePath }) => ({
        path: relativePath,
        status: "published" as const,
      })),
    };
  } catch (error) {
    failed = true;
    primaryError = error;
    preserveStaging =
      error instanceof ImageAssetBatchError && error.preserveStaging;
  }

  if (!preserveStaging) {
    try {
      await fileOperations.rm(stagingDirectory, {
        force: true,
        recursive: true,
      });
    } catch {
      if (primaryError instanceof ImageAssetBatchError) {
        throw new ImageAssetBatchError(
          primaryError.code,
          primaryError.message,
          true,
        );
      }
      throw new ImageAssetBatchError(
        "publish_failed",
        "Image staging cleanup failed.",
        true,
      );
    }
  }

  if (failed) throw primaryError;
  if (!result) {
    throw new ImageAssetBatchError(
      "publish_failed",
      "Image asset batch did not produce a result.",
    );
  }
  return result;
}
