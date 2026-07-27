export interface InlineScriptDetection {
  interpreter: string;
  kind: "eval" | "heredoc";
  code: string;
}

export interface FileWriteBypassDetection {
  kind: "file-write";
  tool: "cat" | "tee" | "echo" | "printf";
  target: string;
  code: string;
}

export type GuardDetection = InlineScriptDetection | FileWriteBypassDetection;

const MAX_EVAL_LENGTH = 80;

const INTERPRETER = String.raw`(python(?:\d(?:\.\d+)?)?|node|ruby|perl|php)`;

// Command wrappers that may precede the interpreter without changing what
// actually runs: `time python3 ...`, `env FOO=1 python3 ...`, `uv run python3 ...`.
const PREFIXES = String.raw`(?:(?:time|sudo|nice|command|uv\s+run|env(?:\s+[A-Za-z_]\w*=\S*)*)\s+)*`;

const EVAL_RE = new RegExp(
  String.raw`(?:^|[|;&\n])\s*${PREFIXES}${INTERPRETER}\b(?:\s+-\w+)*?\s+-(?:c|e|r)\s+("((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')`,
  "s",
);

// Interpreter reading its program from stdin: no script-file argument is
// present between the interpreter (plus flags / lone "-") and the
// heredoc/herestring operator. "python3 script.py <<EOF" is data input and
// does NOT match.
const HEREDOC_RE = new RegExp(
  String.raw`(?:^|[|;&\n])\s*${PREFIXES}${INTERPRETER}\b(?:\s+-\w+|\s+-(?=\s))*\s*(\u003c\u003c\u003c|\u003c\u003c)-?\s*['"]?(\w*)`,
);

function extractHeredocBody(
  command: string,
  matchEnd: number,
  operator: string,
  delimiter: string,
): string {
  if (operator === "<<<") {
    return command
      .slice(matchEnd)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  const bodyStart = command.indexOf("\n", matchEnd);
  if (bodyStart === -1) return "";
  const lines = command.slice(bodyStart + 1).split("\n");
  const end = lines.findIndex((line) => line.trim() === delimiter);
  return (end === -1 ? lines : lines.slice(0, end)).join("\n");
}

export function detectInlineScript(
  command: string,
): InlineScriptDetection | undefined {
  const evalMatch = EVAL_RE.exec(command);
  if (evalMatch) {
    const code = evalMatch[3] ?? evalMatch[4];
    if (code.length > MAX_EVAL_LENGTH || code.includes("\n")) {
      return { interpreter: evalMatch[1], kind: "eval", code };
    }
  }
  const heredocMatch = HEREDOC_RE.exec(command);
  if (heredocMatch) {
    const code = extractHeredocBody(
      command,
      heredocMatch.index + heredocMatch[0].length,
      heredocMatch[2],
      heredocMatch[3],
    );
    return { interpreter: heredocMatch[1], kind: "heredoc", code };
  }
  return undefined;
}

// --- File Write Bypass (see CONTEXT.md / ADR-0002) ---

const MAX_INLINE_CONTENT_LENGTH = 80;

const ANY_HEREDOC_RE = /<<-?\s*['"]?(\w+)['"]?/g;
const TEE_WITH_TARGET_RE = /\btee\s+(?:-\w+\s+)*("[^"]*"|'[^']*'|\S+)/;
const REDIRECT_TARGET_RE = />>?\s*("[^"]*"|'[^']*'|\S+)/;
// echo/printf at a segment start, lazily capturing the argument text up to
// the first output redirect. Lazy `[^>]*?` stops at the first `>`, so the
// measured content never crosses into another command's redirect.
const ECHO_REDIRECT_RE =
  /(?:^|[|;&\n])\s*(echo|printf)\b([^>]*?)>>?\s*("[^"]*"|'[^']*'|\S+)/gs;

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function lineOf(haystack: string, index: number): string {
  const start = haystack.lastIndexOf("\n", index) + 1;
  const nl = haystack.indexOf("\n", index);
  return haystack.slice(start, nl === -1 ? haystack.length : nl);
}

/**
 * Detects shell heredocs / output redirects used to simulate the write/edit
 * tools. Only "landing on disk" forms count: heredoc as pipe data
 * (`cat <<EOF | jq .`, `git commit -F - <<EOF`) and plain redirects without
 * inline content (`cat a b > c`) are allowed. echo/printf follows the same
 * threshold as eval: content >80 chars or containing a newline is blocked,
 * short one-liners pass.
 */
export function detectFileWriteBypass(
  command: string,
): FileWriteBypassDetection | undefined {
  // echo/printf with overlong or multiline inline content redirected to a file.
  for (const echoMatch of command.matchAll(ECHO_REDIRECT_RE)) {
    const content = echoMatch[2].trim();
    if (content.length > MAX_INLINE_CONTENT_LENGTH || content.includes("\n")) {
      return {
        kind: "file-write",
        tool: echoMatch[1] as "echo" | "printf",
        target: unquote(echoMatch[3]),
        code: content,
      };
    }
  }

  // cat/tee consuming a heredoc whose content lands in a file. Everything
  // decisive is on the heredoc's own line: `cat <<EOF > f`, `cat > f <<EOF`,
  // `tee f <<EOF`, `cat <<EOF | tee f`.
  for (const heredocMatch of command.matchAll(ANY_HEREDOC_RE)) {
    const line = lineOf(command, heredocMatch.index);
    const teeMatch = TEE_WITH_TARGET_RE.exec(line);
    if (teeMatch) {
      return {
        kind: "file-write",
        tool: "tee",
        target: unquote(teeMatch[1]),
        code: extractHeredocBody(
          command,
          heredocMatch.index + heredocMatch[0].length,
          "<<",
          heredocMatch[1],
        ),
      };
    }
    if (/\bcat\b/.test(line)) {
      const redirectMatch = REDIRECT_TARGET_RE.exec(line);
      if (redirectMatch) {
        return {
          kind: "file-write",
          tool: "cat",
          target: unquote(redirectMatch[1]),
          code: extractHeredocBody(
            command,
            heredocMatch.index + heredocMatch[0].length,
            "<<",
            heredocMatch[1],
          ),
        };
      }
    }
  }
  return undefined;
}
