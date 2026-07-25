import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ensurePreviewServer,
  findAvailablePort,
  PREVIEW_DIR,
  stopPreviewServer,
} from "./server";

describe("findAvailablePort", () => {
  it("returns the start port when available", async () => {
    const port = await findAvailablePort(54321, "127.0.0.1");
    expect(port).toBe(54321);
  });

  it("finds next available port when start port is in use", async () => {
    const occupier = createServer();
    await new Promise<void>((resolve) =>
      occupier.listen(54322, "127.0.0.1", resolve),
    );

    const port = await findAvailablePort(54322, "127.0.0.1");
    expect(port).toBeGreaterThan(54322);

    occupier.close();
    await new Promise<void>((resolve) => occupier.on("close", resolve));
  });

  it("rejects when no port is available in range", async () => {
    const occupier = createServer();
    await new Promise<void>((resolve) =>
      occupier.listen(54320, "127.0.0.1", resolve),
    );

    await expect(findAvailablePort(54320, "127.0.0.1", 1)).rejects.toThrow(
      "No available port",
    );

    occupier.close();
    await new Promise<void>((resolve) => occupier.on("close", resolve));
  });

  it("rejects on non-EADDRINUSE errors", async () => {
    await expect(findAvailablePort(80, "127.0.0.1")).rejects.toThrow();
  });
});

describe("ensurePreviewServer", () => {
  beforeAll(() => {
    if (!existsSync(PREVIEW_DIR)) {
      mkdirSync(PREVIEW_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    await stopPreviewServer();
  });

  afterEach(async () => {
    await stopPreviewServer();
    // Clean up test files
    if (existsSync(PREVIEW_DIR)) {
      rmSync(PREVIEW_DIR, { recursive: true, force: true });
    }
  });

  it("starts server on default port and serves HTML files", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });
    expect(server.port).toBeGreaterThanOrEqual(3456);

    // Write a test HTML file
    const fileName = "test-file.html";
    writeFileSync(
      join(PREVIEW_DIR, fileName),
      "<h1>Test Content</h1>",
      "utf-8",
    );

    const res = await fetch(`${server.url}/${fileName}`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain("<h1>Test Content</h1>");
  });

  it("serves HTML files from subdirectories", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    // Write a test HTML file in a subdirectory
    const subDir = join(PREVIEW_DIR, "session-abc");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "entry-123.html"),
      "<h1>Subdir Content</h1>",
      "utf-8",
    );

    const res = await fetch(`${server.url}/session-abc/entry-123.html`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain("<h1>Subdir Content</h1>");
  });

  it("reuses existing server on second call", async () => {
    const server1 = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });
    const server2 = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });
    expect(server1.port).toBe(server2.port);
    expect(server1.server).toBe(server2.server);
  });

  it("returns 404 for missing HTML files", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    const res = await fetch(`${server.url}/missing-file.html`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-HTML paths", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    const res = await fetch(`${server.url}/not-html.txt`);
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-GET methods", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    const res = await fetch(server.url, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("serves root page", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    const res = await fetch(server.url);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain("Pi HTML Preview");
  });

  it("returns 500 when file read fails", async () => {
    const server = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });

    // Create a directory with .html extension: existsSync returns true,
    // but readFileSync throws EISDIR
    mkdirSync(join(PREVIEW_DIR, "broken.html"), { recursive: true });

    const res = await fetch(`${server.url}/broken.html`);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal server error");
  });
});

describe("stopPreviewServer", () => {
  it("stops the running server", async () => {
    const srv = await ensurePreviewServer({
      host: "127.0.0.1",
      urlHost: "127.0.0.1",
    });
    expect(srv.server.listening).toBe(true);

    await stopPreviewServer();
    expect(srv.server.listening).toBe(false);
  });

  it("does nothing when no server is running", async () => {
    await expect(stopPreviewServer()).resolves.toBeUndefined();
  });
});
