export interface InlineScriptDetection {
  interpreter: string;
  kind: "eval" | "heredoc";
  code: string;
}

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
