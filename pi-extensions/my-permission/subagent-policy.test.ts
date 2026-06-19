import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSubagentPolicyManager,
  type SubagentPolicy,
} from "./subagent-policy.js";

let tmpDir: string;
let manager: ReturnType<typeof createSubagentPolicyManager>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-permission-"));
  manager = createSubagentPolicyManager({
    snapshotsDir: tmpDir,
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDefaultPolicy", () => {
  it("returns yolo when yoloAllSub is true", () => {
    const policy = manager.getDefaultPolicy(true);
    expect(policy).toBe("yolo");
  });

  it("returns inherit-parent when yoloAllSub is false", () => {
    const policy = manager.getDefaultPolicy(false);
    expect(policy).toBe("inherit-parent");
  });
});

describe("writePolicySnapshot", () => {
  it("writes a yolo snapshot without inherited rules", () => {
    const snapshotPath = manager.writePolicySnapshot("yolo", {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [],
      yolo: false,
    });

    expect(fs.existsSync(snapshotPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    expect(parsed.policy).toBe("yolo");
    expect(parsed.inheritedRules).toBeUndefined();
  });

  it("writes an inherit-parent snapshot with inherited rules", () => {
    const inherited = {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [{ surface: "tools", pattern: "bash", action: "allow" }],
      yolo: true,
    };
    const snapshotPath = manager.writePolicySnapshot("inherit-parent", inherited, "session-123");

    const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    expect(parsed.policy).toBe("inherit-parent");
    expect(parsed.inheritedRules).toEqual(inherited);
  });

  it("creates the snapshots directory if missing", () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    manager.writePolicySnapshot("read-only", {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [],
      yolo: false,
    });
    expect(fs.existsSync(tmpDir)).toBe(true);
  });
});

describe("readPolicySnapshot", () => {
  it("returns undefined when the file does not exist", () => {
    expect(manager.readPolicySnapshot("/nonexistent/snapshot.json")).toBeUndefined();
  });

  it("returns the parsed snapshot", () => {
    const snapshotPath = manager.writePolicySnapshot("yolo", {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [],
      yolo: false,
    });

    const snapshot = manager.readPolicySnapshot(snapshotPath);
    expect(snapshot?.policy).toBe("yolo");
  });

  it("throws when the file contains invalid JSON", () => {
    const filePath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(filePath, "not json", "utf-8");
    expect(() => manager.readPolicySnapshot(filePath)).toThrow();
  });
});

describe("deletePolicySnapshot", () => {
  it("removes an existing snapshot", () => {
    const snapshotPath = manager.writePolicySnapshot("yolo", {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [],
      yolo: false,
    });

    manager.deletePolicySnapshot(snapshotPath);
    expect(fs.existsSync(snapshotPath)).toBe(false);
  });

  it("does not throw when the file does not exist", () => {
    expect(() => manager.deletePolicySnapshot("/nonexistent/snapshot.json")).not.toThrow();
  });
});

describe("isSubagentProcess", () => {
  it("returns true when MY_PERMISSION_SUBAGENT_POLICY_FILE is set", () => {
    const filePath = manager.writePolicySnapshot("yolo", {
      config: { default: "ask", external: "ask", log: { debug: false, review: true }, tools: {}, bash: {}, paths: {}, skills: {} },
      sessionRules: [],
      yolo: false,
    });
    expect(
      manager.isSubagentProcess({
        MY_PERMISSION_SUBAGENT_POLICY_FILE: filePath,
      }),
    ).toBe(true);
  });

  it("returns true when MY_PERMISSION_SUBAGENT_POLICY is set", () => {
    expect(
      manager.isSubagentProcess({
        MY_PERMISSION_SUBAGENT_POLICY: "yolo",
      }),
    ).toBe(true);
  });

  it("returns false when no subagent variables are set", () => {
    expect(manager.isSubagentProcess({})).toBe(false);
  });
});
