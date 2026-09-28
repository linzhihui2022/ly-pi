import { readFileSync } from "node:fs";

/** Read a file as UTF-8. Returns empty string if the file is missing or unreadable. */
export function loadFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}
