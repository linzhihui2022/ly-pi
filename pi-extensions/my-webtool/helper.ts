import { TruncationResult } from "@earendil-works/pi-coding-agent";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const MIN_SEARCH_RESULTS = 1;
export const MAX_SEARCH_RESULTS = 10;
export const DEFAULT_SEARCH_RESULTS = 5;
export const FETCH_PREVIEW_LINE_LIMIT = 15;

const FETCH_TEMP_DIR_PREFIX = "pi-webtool-fetch-";
const FETCH_TEMP_FILE_NAME = "content.txt";
export function clampSearchResultCount(requested: number | undefined): number {
  const value = requested ?? DEFAULT_SEARCH_RESULTS;
  return Math.min(Math.max(value, MIN_SEARCH_RESULTS), MAX_SEARCH_RESULTS);
}
export async function spillFullContentToTempFile(
  content: string,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), FETCH_TEMP_DIR_PREFIX));
  const tempFile = join(tempDir, FETCH_TEMP_FILE_NAME);
  await writeFile(tempFile, content, "utf8");
  return tempFile;
}
