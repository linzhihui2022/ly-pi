import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnsurePreviewServer, mockStopPreviewServer, mockOpen } =
  vi.hoisted(() => ({
    mockEnsurePreviewServer: vi.fn(),
    mockStopPreviewServer: vi.fn(),
    mockOpen: vi.fn(),
  }));

vi.mock("open", () => ({ default: mockOpen }));
vi.mock("../../web-preview/index", () => ({
  ensurePreviewServer: mockEnsurePreviewServer,
  PREVIEW_DIR: join(tmpdir(), "pi-html-preview-test"),
  stopPreviewServer: mockStopPreviewServer,
}));

import { PREVIEW_DIR, servePreviewFile, stopPreviewServer } from "./preview";

describe("servePreviewFile", () => {
  const sessionDir = join(PREVIEW_DIR, "test-session");

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsurePreviewServer.mockResolvedValue({
      url: "http://localhost:3456",
      port: 3456,
      server: {} as never,
    });
    mockOpen.mockResolvedValue(undefined);
    rmSync(PREVIEW_DIR, { recursive: true, force: true });
    mkdirSync(PREVIEW_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(PREVIEW_DIR, { recursive: true, force: true });
  });

  it("writes content to the preview directory and returns URL", async () => {
    const url = await servePreviewFile(
      "test-session",
      "test.html",
      "<h1>Hi</h1>",
    );

    const filePath = join(sessionDir, "test.html");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("<h1>Hi</h1>");
    expect(url).toBe("http://localhost:3456/test-session/test.html");
    expect(mockOpen).toHaveBeenCalledWith(url);
    expect(mockEnsurePreviewServer).toHaveBeenCalledWith({
      host: "127.0.0.1",
      urlHost: "localhost",
      port: 3456,
    });
  });

  it("accepts custom host/port options", async () => {
    await servePreviewFile("s2", "f.html", "x", {
      host: "0.0.0.0",
      urlHost: "example.com",
      port: 9999,
    });

    expect(mockEnsurePreviewServer).toHaveBeenCalledWith({
      host: "0.0.0.0",
      urlHost: "example.com",
      port: 9999,
    });
  });

  it("open failures are non-fatal (swallowed)", async () => {
    mockOpen.mockRejectedValueOnce(new Error("no browser"));

    const url = await servePreviewFile("s3", "f.html", "x");
    expect(url).toBe("http://localhost:3456/s3/f.html");
  });

  it("re-exports stopPreviewServer", () => {
    expect(typeof stopPreviewServer).toBe("function");
  });
});
