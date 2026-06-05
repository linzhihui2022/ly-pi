import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const EXT_DIR = __dirname;

export function loadCss(cssDir: string = EXT_DIR): { github: string; highlight: string } {
  try {
    const githubPath = join(cssDir, "node_modules", "github-markdown-css", "github-markdown-dark.css");
    const hlPath = join(cssDir, "node_modules", "highlight.js", "styles", "github-dark.css");
    return {
      github: readFileSync(githubPath, "utf-8"),
      highlight: readFileSync(hlPath, "utf-8"),
    };
  } catch {
    return { github: "", highlight: "" };
  }
}

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  }),
);

export function renderMarkdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`{3}[\w]*\n?([\s\S]*?)\n?`{3}/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildHtmlDocument(
  bodyHtml: string,
  thinkingText?: string,
): string {
  const { github, highlight } = loadCss();
  const thinkingBlock = thinkingText
    ? `<details class="thinking-block">
  <summary>🧠 Thinking</summary>
  <pre><code>${ansiToHtml(thinkingText)}</code></pre>
</details>
`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pi Agent Reply</title>
  <style>
${github}
${highlight}
.thinking-block {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: #313244;
  border: 1px solid #6c7086;
  border-radius: 6px;
  color: #cdd6f4;
}
.thinking-block summary {
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  color: #cba6f7;
}
.thinking-block pre {
  margin-top: 0.75rem;
  background: #181825;
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
  color: #cdd6f4;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #cdd6f4;
  background: #1e1e2e;
  padding: 2rem 1rem;
}
.markdown-body {
  max-width: 900px;
  margin: 0 auto;
}
  </style>
</head>
<body>
  <main class="markdown-body">
${thinkingBlock}${bodyHtml}
  </main>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert ANSI escape sequences (true-color foreground) to HTML spans.
 * Only supports 38;2;R;G;B (true color) and reset (0 / 39).
 */
export function ansiToHtml(text: string): string {
  // Match both standard ANSI (\x1b[38;2;R;G;Bm) and bare bracket sequences
  // produced by pi's thinking output ([38;2;R;G;Bm, [39m, [0m).
  const ANSI_RE = /(?:\x1b)?\[(38;2;\d+;\d+;\d+|39|0)m/g;

  let result = "";
  let lastIndex = 0;
  let hasColorSpan = false;

  for (const match of text.matchAll(ANSI_RE)) {
    const fullMatch = match[0];
    const params = match[1];
    const start = match.index!;

    // Append text before this escape sequence (escape it)
    if (start > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, start));
    }

    if (params === "39" || params === "0") {
      // Reset foreground
      if (hasColorSpan) {
        result += "</span>";
        hasColorSpan = false;
      }
    } else if (params.startsWith("38;2;")) {
      const parts = params.split(";");
      const r = parseInt(parts[2], 10);
      const g = parseInt(parts[3], 10);
      const b = parseInt(parts[4], 10);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        // Close previous color span if any (new color overrides old)
        if (hasColorSpan) {
          result += "</span>";
        }
        result += `<span style="color:rgb(${r},${g},${b})">`;
        hasColorSpan = true;
      }
    }

    lastIndex = start + fullMatch.length;
  }

  // Append remaining text
  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  // Close any remaining span
  if (hasColorSpan) {
    result += "</span>";
  }

  return result;
}

export function extractAssistantText(
  content: Array<{ type: string; text?: string; thinking?: string }>,
  targetType: "text" | "thinking" = "text",
): string {
  return content
    .filter((block) => block.type === targetType)
    .map((block) => (targetType === "thinking" ? block.thinking : block.text) ?? "")
    .join("\n\n");
}
