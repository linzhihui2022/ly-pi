import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { loadConfig, resolveConfigPath } from "./config";

function tempDir() {
  const dir = join(tmpdir(), `my-permission-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("loadConfig", () => {
  it("loads valid config", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ deny: ["edit", "bash"] }), "utf-8");
    expect(loadConfig(path)).toEqual({ deny: ["edit", "bash"] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list when file missing", () => {
    expect(loadConfig("/nonexistent/my-permission/config.json")).toEqual({
      deny: [],
    });
  });

  it("resolves deployed config path when deployed file exists", () => {
    const deployed = join(
      homedir(),
      ".pi/agent/extensions/my-permission/config.json",
    );
    const dir = dirname(deployed);
    mkdirSync(dir, { recursive: true });
    writeFileSync(deployed, JSON.stringify({ deny: ["bash"] }), "utf-8");
    expect(resolveConfigPath()).toBe(deployed);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on invalid JSON", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(path, "not json", "utf-8");
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件 JSON 解析失败"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list when JSON.parse throws a non-Error", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(path, "{}", "utf-8");
    const spy = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw "parse error";
    });
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith("配置文件 JSON 解析失败", "error");
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on schema error", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(path, JSON.stringify({ deny: [1, 2] }), "utf-8");
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件格式错误"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on extra properties", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(
      path,
      JSON.stringify({ deny: ["edit"], allow: ["bash"] }),
      "utf-8",
    );
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件格式错误"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolveConfigPath", () => {
  it("returns override when provided", () => {
    expect(resolveConfigPath("/custom/config.json")).toBe("/custom/config.json");
  });

  it("falls back to bundled config when deployed file missing", () => {
    const deployed = join(
      homedir(),
      ".pi/agent/extensions/my-permission/config.json",
    );
    const dir = dirname(deployed);
    rmSync(dir, { recursive: true, force: true });
    const resolved = resolveConfigPath();
    expect(resolved).toContain("my-permission/config.json");
  });
});

describe("loadConfig edge cases", () => {
  it("returns empty list when readFileSync throws", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    mkdirSync(path);
    expect(loadConfig(path)).toEqual({ deny: [] });
    rmSync(dir, { recursive: true, force: true });
  });
});
