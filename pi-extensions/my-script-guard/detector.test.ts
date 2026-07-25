import { describe, expect, it } from "vitest";
import { detectInlineScript } from "./detector";

describe("detectInlineScript", () => {
  it("detects python -c with code longer than 80 chars", () => {
    const code = `import json; data = json.load(open('f.json')); print(json.dumps(data, indent=2, ensure_ascii=False))`;
    expect(code.length).toBeGreaterThan(80);
    const result = detectInlineScript(`python3 -c "${code}"`);
    expect(result).toMatchObject({
      interpreter: "python3",
      kind: "eval",
      code,
    });
  });

  it("allows a short python one-liner (80 chars or less, single line)", () => {
    expect(
      detectInlineScript('python3 -c "import json; print(1)"'),
    ).toBeUndefined();
  });

  it("detects python -c with multiline code even when short", () => {
    const result = detectInlineScript("python3 -c 'x = 1\nprint(x)'");
    expect(result).toMatchObject({ interpreter: "python3", kind: "eval" });
  });

  it("detects node -e, ruby -e, perl -e and php -r with long code", () => {
    const long = "x".repeat(81);
    expect(detectInlineScript(`node -e "${long}"`)).toMatchObject({
      interpreter: "node",
      kind: "eval",
    });
    expect(detectInlineScript(`ruby -e "${long}"`)).toMatchObject({
      interpreter: "ruby",
      kind: "eval",
    });
    expect(detectInlineScript(`perl -e "${long}"`)).toMatchObject({
      interpreter: "perl",
      kind: "eval",
    });
    expect(detectInlineScript(`php -r "${long}"`)).toMatchObject({
      interpreter: "php",
      kind: "eval",
    });
  });

  it("detects a heredoc piped into an interpreter, regardless of length", () => {
    const cmd = "python3 <<'EOF'\nprint('hi')\nEOF";
    const result = detectInlineScript(cmd);
    expect(result).toMatchObject({ interpreter: "python3", kind: "heredoc" });
  });

  it("detects interpreter reading program from stdin via dash plus heredoc", () => {
    const cmd = "python3 - <<EOF\nprint('hi')\nEOF";
    expect(detectInlineScript(cmd)).toMatchObject({ kind: "heredoc" });
  });

  it("allows running a script file", () => {
    expect(
      detectInlineScript("python3 scripts/convert.py --fast"),
    ).toBeUndefined();
    expect(detectInlineScript("node tool.js")).toBeUndefined();
  });

  it("allows a script file consuming a heredoc as data", () => {
    const cmd = "python3 scripts/import.py <<EOF\nsome data\nEOF";
    expect(detectInlineScript(cmd)).toBeUndefined();
  });

  it("allows non-interpreter commands mentioning interpreter names", () => {
    expect(detectInlineScript("grep python3 README.md")).toBeUndefined();
    expect(
      detectInlineScript("cat <<EOF | python3 scripts/x.py\nhi\nEOF"),
    ).toBeUndefined();
  });

  it("detects a herestring feeding code to an interpreter", () => {
    const result = detectInlineScript('python3 - <<< "print(1)"');
    expect(result).toMatchObject({ interpreter: "python3", kind: "heredoc" });
  });

  it("detects a heredoc whose delimiter never closes", () => {
    const result = detectInlineScript("python3 <<EOF\nprint(1)");
    expect(result).toMatchObject({ kind: "heredoc", code: "print(1)" });
  });

  it("detects a heredoc with an empty body", () => {
    const result = detectInlineScript("python3 <<EOF");
    expect(result).toMatchObject({ kind: "heredoc", code: "" });
  });

  it("detects eval behind command prefixes (time/sudo/env/uv run)", () => {
    const long = "x".repeat(81);
    expect(detectInlineScript(`time python3 -c "${long}"`)).toMatchObject({
      interpreter: "python3",
      kind: "eval",
    });
    expect(detectInlineScript(`sudo python3 -c "${long}"`)).toMatchObject({
      interpreter: "python3",
      kind: "eval",
    });
    expect(
      detectInlineScript(`env FOO=1 BAR=2 python3 -c "${long}"`),
    ).toMatchObject({ interpreter: "python3", kind: "eval" });
    expect(detectInlineScript(`uv run python3 -c "${long}"`)).toMatchObject({
      interpreter: "python3",
      kind: "eval",
    });
  });

  it("detects heredoc behind command prefixes", () => {
    expect(
      detectInlineScript("time python3 <<EOF\nprint(1)\nEOF"),
    ).toMatchObject({ kind: "heredoc" });
    expect(
      detectInlineScript("uv run python3 <<EOF\nprint(1)\nEOF"),
    ).toMatchObject({ kind: "heredoc" });
  });

  it("still allows prefixed script-file execution", () => {
    expect(
      detectInlineScript("time python3 scripts/convert.py"),
    ).toBeUndefined();
    expect(
      detectInlineScript("uv run python3 scripts/convert.py"),
    ).toBeUndefined();
  });
});
