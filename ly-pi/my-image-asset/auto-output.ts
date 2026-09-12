import { lstat } from "node:fs/promises";
import { extname } from "node:path";
import {
  type AutomaticOutputKind,
  ImageAssetError,
  type ImageAssetRequest,
  type ResolvedImageAssetRequest,
  resolveImageAssetRequest,
} from "./contract";

const MAX_AUTOMATIC_OUTPUT_ATTEMPTS = 100;

function numberedOutputPath(path: string, attempt: number): string {
  if (attempt === 1) return path;
  const extension = extname(path);
  return `${path.slice(0, -extension.length)}-${attempt}${extension}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new ImageAssetError(
      "invalid_request",
      "Automatic image output path cannot be inspected.",
    );
  }
}

export async function resolveAutomaticImageAssetRequest(
  request: ImageAssetRequest,
  cwd: string,
  automaticOutput: AutomaticOutputKind | undefined,
): Promise<ResolvedImageAssetRequest> {
  if (!automaticOutput) return resolveImageAssetRequest(request, cwd);

  const originalOutputPath = request.output_paths[0];
  if (!originalOutputPath) {
    throw new ImageAssetError(
      "invalid_request",
      "Automatic image output path is invalid.",
    );
  }
  for (let attempt = 1; attempt <= MAX_AUTOMATIC_OUTPUT_ATTEMPTS; attempt++) {
    const candidateRequest: ImageAssetRequest = {
      ...request,
      output_paths: [numberedOutputPath(originalOutputPath, attempt)],
    };
    const resolved = await resolveImageAssetRequest(candidateRequest, cwd);
    const output = resolved.outputPaths[0];
    if (output && !(await pathExists(output.absolutePath))) return resolved;
  }

  throw new ImageAssetError(
    "invalid_request",
    "An automatic image output path could not be selected.",
  );
}
