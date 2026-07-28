import { describe, expect, it } from "vitest";
import { buildConfirmMessage, buildReason, detectFileWriteBypass, detectInlineScript } from "./detector";

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

describe("detectFileWriteBypass", () => {
  it("blocks a cat heredoc redirected to a file", () => {
    const cmd = "cat <<'EOF' > config.yaml\nfoo: bar\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      kind: "file-write",
      tool: "cat",
      target: "config.yaml",
      code: "foo: bar",
    });
  });

  it("blocks a cat heredoc appended to a file", () => {
    const cmd = "cat <<EOF >> notes.md\nextra line\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      kind: "file-write",
      tool: "cat",
      target: "notes.md",
    });
  });

  it("blocks a cat heredoc when the redirect precedes the heredoc", () => {
    const cmd = "cat > out.txt <<EOF\nbody\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      kind: "file-write",
      tool: "cat",
      target: "out.txt",
    });
  });

  it("blocks a quoted redirect target", () => {
    const cmd = 'cat <<EOF > "my file.txt"\nbody\nEOF';
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      tool: "cat",
      target: "my file.txt",
    });
  });

  it("blocks a tee heredoc writing a file", () => {
    const cmd = "tee settings.json <<'EOF'\n{}\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      kind: "file-write",
      tool: "tee",
      target: "settings.json",
      code: "{}",
    });
  });

  it("blocks a tee -a heredoc appending a file", () => {
    const cmd = "tee -a log.txt <<EOF\nentry\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      tool: "tee",
      target: "log.txt",
    });
  });

  it("blocks a cat heredoc piped to tee", () => {
    const cmd = "cat <<EOF | tee out.txt\nbody\nEOF";
    expect(detectFileWriteBypass(cmd)).toMatchObject({
      tool: "tee",
      target: "out.txt",
    });
  });

  it("blocks an echo redirect whose content exceeds 80 chars", () => {
    const long = "x".repeat(81);
    expect(detectFileWriteBypass(`echo "${long}" > file.txt`)).toMatchObject({
      kind: "file-write",
      tool: "echo",
      target: "file.txt",
    });
  });

  it("blocks a multiline echo redirect even when short", () => {
    expect(
      detectFileWriteBypass('echo "line1\nline2" > file.txt'),
    ).toMatchObject({ kind: "file-write", tool: "echo" });
  });

  it("blocks a long printf redirect", () => {
    const long = "x".repeat(81);
    expect(
      detectFileWriteBypass(`printf '%s\\n' ${long} > file.txt`),
    ).toMatchObject({ kind: "file-write", tool: "printf", target: "file.txt" });
  });

  it("allows a short echo append one-liner", () => {
    expect(detectFileWriteBypass('echo "FOO=bar" >> .env')).toBeUndefined();
  });

  it("allows a heredoc used as pipe data", () => {
    expect(detectFileWriteBypass("cat <<EOF | jq .\n{}\nEOF")).toBeUndefined();
    expect(
      detectFileWriteBypass("git commit -F - <<EOF\nmsg\nEOF"),
    ).toBeUndefined();
  });

  it("allows tee without a file target (stdout only)", () => {
    expect(detectFileWriteBypass("cat <<EOF | tee\nbody\nEOF")).toBeUndefined();
  });

  it("allows plain redirects without inline content", () => {
    expect(detectFileWriteBypass("cat a.txt b.txt > c.txt")).toBeUndefined();
    expect(detectFileWriteBypass("grep x app.log > out.txt")).toBeUndefined();
  });

  it("blocks a cat heredoc with no body", () => {
    expect(detectFileWriteBypass("cat <<EOF > out.txt")).toMatchObject({
      kind: "file-write",
      tool: "cat",
      target: "out.txt",
      code: "",
    });
  });

  it("allows plain cat and script-file execution", () => {
    expect(detectFileWriteBypass("cat file.txt")).toBeUndefined();
    expect(
      detectFileWriteBypass("python3 scripts/import.py <<EOF\ndata\nEOF"),
    ).toBeUndefined();
  });
});

const LONG_CODE = "x".repeat(81);

describe("buildReason", () => {
  it("names the interpreter, the kind, and the file-based alternative", () => {
    const detection = detectInlineScript(`python3 -c "${LONG_CODE}"`);
    if (!detection) throw new Error("expected detection");
    const reason = buildReason(detection);
    expect(reason).toContain("python3");
    expect(reason).toContain("eval");
    expect(reason).toContain("python3 <file>");
  });

  it("names the tool and target for a file write bypass", () => {
    const detection = detectFileWriteBypass("cat <<EOF > out.txt\nbody\nEOF");
    if (!detection) throw new Error("expected detection");
    const reason = buildReason(detection);
    expect(reason).toContain("cat");
    expect(reason).toContain("out.txt");
    expect(reason).toContain("write/edit");
  });
});

describe("buildConfirmMessage", () => {
  it("builds confirm message for file write bypass", () => {
    const detection = detectFileWriteBypass("cat <<EOF > out.txt\nbody\nEOF");
    if (!detection) throw new Error("expected detection");
    const msg = buildConfirmMessage(detection, 4);
    expect(msg.title).toContain("文件写入旁路已被拦截");
    expect(msg.title).toContain("4");
    expect(msg.body).toContain("cat");
    expect(msg.body).toContain("out.txt");
  });

  it("builds confirm message for inline script", () => {
    const detection = detectInlineScript(`python3 -c "${LONG_CODE}"`);
    if (!detection) throw new Error("expected detection");
    const msg = buildConfirmMessage(detection, 4);
    expect(msg.title).toContain("内联脚本已被拦截");
    expect(msg.body).toContain("python3");
    expect(msg.body).toContain("eval");
  });

  it("truncates long code in preview", () => {
    const superLong = "y".repeat(600);
    const detection = detectInlineScript(`python3 -c "${superLong}"`);
    if (!detection) throw new Error("expected detection");
    const msg = buildConfirmMessage(detection, 1);
    expect(msg.body).toContain("…");
    expect(msg.body.length).toBeLessThan(550);
  });
});
