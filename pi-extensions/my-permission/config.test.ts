import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";

vi.mock("./config.json", () => ({
  default: {
    permission: {
      path: [{ key: "*.env", value: "deny" }],
      bash: [],
      tool: [],
    },
  },
}));

describe("loadConfig", () => {
  it("returns config.json when valid", () => {
    const notify = vi.fn();
    const config = loadConfig(notify);
    expect(config.permission.path).toEqual([{ key: "*.env", value: "deny" }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies and returns default when raw config is invalid", () => {
    const notify = vi.fn();
    const invalid = { permission: { path: [{ key: 123, value: "deny" }] } } as any;
    const config = loadConfig(notify, invalid);
    expect(notify).toHaveBeenCalledWith(
      "Invalid my-permission config.json; using default permissions.",
      "error",
    );
    expect(config).toEqual({
      permission: { path: [], bash: [], tool: [] },
    });
  });

  it("does not throw when notify is omitted", () => {
    const invalid = { permission: { path: [{ key: 123, value: "deny" }] } } as any;
    expect(() => loadConfig(undefined, invalid)).not.toThrow();
  });
});
