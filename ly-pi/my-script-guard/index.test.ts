import { describe, expect, it } from "vitest";
import { detectFileWriteBypass, detectInlineScript } from "./detector";
import { scriptGuard } from "./index";

const LONG_CODE = "x".repeat(81);
const LONG_EVAL = `python3 -c "${LONG_CODE}"`;

describe("scriptGuard", () => {
  describe("name", () => {
    it("has name 'script-guard'", () => {
      expect(scriptGuard.name).toBe("script-guard");
    });
  });

  describe("escalation", () => {
    it("has threshold 3", () => {
      expect(scriptGuard.escalation?.threshold).toBe(3);
    });

    it("has buildConfirm", () => {
      expect(scriptGuard.escalation?.buildConfirm).toBeTypeOf("function");
    });
  });

  describe("detect", () => {
    it("returns detection for long inline eval", () => {
      const result = scriptGuard.detect(LONG_EVAL, "/repo");
      expect(result).toBeDefined();
      expect(result!.interpreter).toBe("python3");
      expect(result!.kind).toBe("eval");
    });

    it("returns detection for file write bypass", () => {
      const result = scriptGuard.detect(
        "cat <<'EOF' > config.yaml\nfoo: bar\nEOF",
        "/repo",
      );
      expect(result).toBeDefined();
      expect(result!.kind).toBe("file-write");
    });

    it("returns undefined for normal commands", () => {
      expect(scriptGuard.detect("ls -la", "/repo")).toBeUndefined();
      expect(scriptGuard.detect("python3 script.py", "/repo")).toBeUndefined();
    });

    it("detects inline script before file write bypass (same command)", () => {
      // A heredoc to python3: inline script wins over file write
      const result = scriptGuard.detect(
        `python3 <<'EOF'\n${LONG_CODE}\nEOF`,
        "/repo",
      );
      expect(result).toBeDefined();
      // Should be "heredoc" (inline script), not "file-write"
      expect(result!.kind).toBe("heredoc");
    });
  });

  describe("react", () => {
    it("returns block with reason for inline script", () => {
      const detection = detectInlineScript(LONG_EVAL);
      if (!detection) throw new Error("expected detection");
      const result = scriptGuard.react(detection, {} as never, {} as never);
      expect(result).toBeDefined();
      if (result && "block" in result) {
        expect(result.block).toBe(true);
        expect(result.reason).toContain("python3");
      }
    });

    it("returns block with reason for file write bypass", () => {
      const detection = detectFileWriteBypass("cat <<EOF > out.txt\nbody\nEOF");
      if (!detection) throw new Error("expected detection");
      const result = scriptGuard.react(detection, {} as never, {} as never);
      expect(result).toBeDefined();
      if (result && "block" in result) {
        expect(result.block).toBe(true);
        expect(result.reason).toContain("cat");
        expect(result.reason).toContain("out.txt");
      }
    });
  });
});
