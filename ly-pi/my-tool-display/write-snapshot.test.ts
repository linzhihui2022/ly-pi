import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWriteDiffDetails,
  isWritePreviewCurrent,
  MAX_WRITE_DIFF_BYTES,
  readWritePreview,
} from "./write-snapshot";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tool-display-snapshot-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readWritePreview", () => {
  it("treats a missing file as empty previous content", () => {
    expect(readWritePreview(root, "new.txt", "content")).toMatchObject({
      safe: true,
      previousContent: "",
      snapshot: { existed: false },
    });
  });

  it("captures the previous content of an existing file", () => {
    writeFileSync(join(root, "a.txt"), "before");
    expect(readWritePreview(root, "a.txt", "after")).toMatchObject({
      safe: true,
      previousContent: "before",
      snapshot: { existed: true },
    });
  });

  it("rejects next content above the preview limit", () => {
    const preview = readWritePreview(
      root,
      "a.txt",
      "x".repeat(MAX_WRITE_DIFF_BYTES + 1),
    );
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("preview limit");
  });

  it("rejects binary next content", () => {
    const preview = readWritePreview(root, "a.txt", "a\0b");
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("binary");
  });

  it("rejects next content that cannot round-trip as UTF-8", () => {
    const preview = readWritePreview(root, "a.txt", "\ud800");
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("UTF-8");
  });

  it("rejects existing files above the preview limit", () => {
    writeFileSync(join(root, "big.txt"), "x".repeat(MAX_WRITE_DIFF_BYTES + 1));
    const preview = readWritePreview(root, "big.txt", "small");
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("preview limit");
  });

  it("rejects existing binary files", () => {
    writeFileSync(join(root, "bin.txt"), Buffer.from([0x61, 0x00, 0x62]));
    const preview = readWritePreview(root, "bin.txt", "text");
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("binary");
  });

  it("rejects existing files with invalid UTF-8", () => {
    writeFileSync(join(root, "bad.txt"), Buffer.from([0xff, 0xfe, 0xfd]));
    const preview = readWritePreview(root, "bad.txt", "text");
    expect(preview).toMatchObject({ safe: false });
    if (!preview.safe) expect(preview.reason).toContain("invalid UTF-8");
  });
});

describe("isWritePreviewCurrent", () => {
  it("is true while the file is unchanged", () => {
    writeFileSync(join(root, "a.txt"), "content");
    const preview = readWritePreview(root, "a.txt", "next");
    expect(preview.safe).toBe(true);
    if (preview.safe) {
      expect(isWritePreviewCurrent(preview)).toBe(true);
    }
  });

  it("is false once the file content changed", () => {
    writeFileSync(join(root, "a.txt"), "content");
    const preview = readWritePreview(root, "a.txt", "next");
    writeFileSync(join(root, "a.txt"), "changed content");
    if (preview.safe) {
      expect(isWritePreviewCurrent(preview)).toBe(false);
    }
  });

  it("is false when a file appeared where the snapshot saw none", () => {
    const preview = readWritePreview(root, "new.txt", "content");
    writeFileSync(join(root, "new.txt"), "appeared");
    if (preview.safe) {
      expect(isWritePreviewCurrent(preview)).toBe(false);
    }
  });

  it("stays true when a new file is still missing", () => {
    const preview = readWritePreview(root, "new.txt", "content");
    if (preview.safe) {
      expect(isWritePreviewCurrent(preview)).toBe(true);
    }
  });

  it("is false when the snapshot expected a file that disappeared", () => {
    writeFileSync(join(root, "a.txt"), "content");
    const preview = readWritePreview(root, "a.txt", "next");
    rmSync(join(root, "a.txt"));
    if (preview.safe) {
      expect(isWritePreviewCurrent(preview)).toBe(false);
    }
  });
});

describe("addWriteDiffDetails", () => {
  it("merges the diff into existing details", () => {
    const result = addWriteDiffDetails(
      { content: [], details: { other: 1 } },
      { kind: "diff", diff: "@@ -1 +1 @@" },
    );
    expect(result.details).toEqual({
      other: 1,
      writeDiff: { kind: "diff", diff: "@@ -1 +1 @@" },
    });
  });

  it("creates details when the result has none", () => {
    const result = addWriteDiffDetails(
      { content: [], details: undefined },
      { kind: "summary", summary: "no changes" },
    );
    expect(result.details).toEqual({
      writeDiff: { kind: "summary", summary: "no changes" },
    });
  });
});
