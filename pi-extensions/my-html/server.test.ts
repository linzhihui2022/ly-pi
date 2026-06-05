import { describe, it, expect, afterEach, vi } from "vitest";
import { findAvailablePort, createPreviewServer, stopPreviewServer } from "./server";
import type { PreviewServer } from "./types";
import { createServer } from "node:http";

describe("findAvailablePort", () => {
  it("returns the start port when available", async () => {
    const port = await findAvailablePort(54321, "127.0.0.1");
    expect(port).toBe(54321);
  });

  it("finds next available port when start port is in use", async () => {
    const occupier = createServer();
    await new Promise<void>((resolve) => occupier.listen(54322, "127.0.0.1", resolve));

    const port = await findAvailablePort(54322, "127.0.0.1");
    expect(port).toBeGreaterThan(54322);

    occupier.close();
    await new Promise<void>((resolve) => occupier.on("close", resolve));
  });

  it("rejects when no port is available in range", async () => {
    const occupier = createServer();
    await new Promise<void>((resolve) => occupier.listen(54320, "127.0.0.1", resolve));

    await expect(findAvailablePort(54320, "127.0.0.1", 1)).rejects.toThrow("No available port");

    occupier.close();
    await new Promise<void>((resolve) => occupier.on("close", resolve));
  });

  it("rejects on non-EADDRINUSE errors", async () => {
    // Port 80 typically requires root privileges, triggering EACCES
    await expect(findAvailablePort(80, "127.0.0.1")).rejects.toThrow();
  });
});

describe("createPreviewServer", () => {
  let server: PreviewServer | null = null;

  afterEach(async () => {
    if (server) {
      await stopPreviewServer();
      server = null;
    }
  });

  it("serves HTML content on root path", async () => {
    server = await createPreviewServer("<h1>Test</h1>", { host: "127.0.0.1", urlHost: "127.0.0.1" });

    const res = await fetch(server.url);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain("<h1>Test</h1>");
  });

  it("returns 404 for non-root paths", async () => {
    server = await createPreviewServer("<h1>Test</h1>", { host: "127.0.0.1", urlHost: "127.0.0.1" });

    const res = await fetch(`${server.url}/not-found`);
    expect(res.status).toBe(404);
  });
});

describe("stopPreviewServer", () => {
  it("stops the running server", async () => {
    const srv = await createPreviewServer("<h1>Test</h1>", { host: "127.0.0.1", urlHost: "127.0.0.1" });
    expect(srv.server.listening).toBe(true);

    await stopPreviewServer();
    expect(srv.server.listening).toBe(false);
  });

  it("does nothing when no server is running", async () => {
    await expect(stopPreviewServer()).resolves.toBeUndefined();
  });
});
