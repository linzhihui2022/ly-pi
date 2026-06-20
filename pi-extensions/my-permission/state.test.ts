import { describe, it, expect } from "vitest";
import { PermissionState } from "./state";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

describe("PermissionState", () => {
  it("creates empty state", () => {
    const state = new PermissionState();
    expect(state.list()).toEqual([]);
  });

  it("loads from config", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "write"] });
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "write", source: "config" },
    ]);
  });

  it("denies a tool and marks it runtime", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "bash", source: "runtime" },
    ]);
  });

  it("deny is idempotent", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("edit");
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("deny is idempotent for runtime entries", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    state.deny("bash");
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "bash", source: "runtime" },
    ]);
  });

  it("denies multiple runtime tools without re-copying config", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    state.deny("write");
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "bash", source: "runtime" },
      { tool: "write", source: "runtime" },
    ]);
  });

  it("allow removes a runtime-denied tool", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "bash"] });
    state.deny("bash");
    state.allow("bash");
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("allow removes a config-denied tool", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "bash"] });
    state.allow("edit");
    expect(state.list()).toEqual([{ tool: "bash", source: "config" }]);
  });

  it("allow is idempotent", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.allow("edit");
    state.allow("edit");
    expect(state.list()).toEqual([]);
  });

  it("reset restores config defaults", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    state.allow("edit");
    state.reset();
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("snapshot returns current deny list", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    expect(state.snapshot()).toEqual({ deny: ["edit", "bash"] });
  });

  it("restores from session entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["write", "bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([
      { tool: "write", source: "runtime" },
      { tool: "bash", source: "runtime" },
    ]);
  });

  it("uses config when no matching entries", () => {
    const state = PermissionState.fromEntries([], { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("uses latest matching entry", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["write"] },
      },
      {
        type: "custom",
        customType: "other",
        data: { deny: ["bash"] },
      },
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "bash", source: "runtime" }]);
  });

  it("skips non-custom entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "tool_result",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("skips entries with other customType", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "other",
        data: { deny: ["bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("ignores entries with invalid data shape", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: "edit" },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("ignores entries with null data", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: null,
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("ignores entries with non-object data", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: "edit",
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });
});
