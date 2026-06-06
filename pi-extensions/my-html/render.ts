import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const EXT_DIR = __dirname;

const CATPPUCCIN_MOCHA_HLJS = `/* Catppuccin Mocha for Highlight.js */
.markdown-body .hljs,
.markdown-body .hljs-subst {
  color: #cdd6f4;
  background: transparent;
}
.markdown-body .hljs-keyword { color: #cba6f7; }
.markdown-body .hljs-built_in { color: #f38ba8; }
.markdown-body .hljs-type { color: #f9e2af; }
.markdown-body .hljs-literal { color: #fab387; }
.markdown-body .hljs-number { color: #fab387; }
.markdown-body .hljs-operator { color: #89dceb; }
.markdown-body .hljs-punctuation { color: #bac2de; }
.markdown-body .hljs-property { color: #94e2d5; }
.markdown-body .hljs-regexp { color: #f5c2e7; }
.markdown-body .hljs-string { color: #a6e3a1; }
.markdown-body .hljs-char.escape_ { color: #a6e3a1; }
.markdown-body .hljs-subst { color: #a6adc8; }
.markdown-body .hljs-symbol { color: #f2cdcd; }
.markdown-body .hljs-variable { color: #cba6f7; }
.markdown-body .hljs-variable.language_ { color: #cba6f7; }
.markdown-body .hljs-variable.constant_ { color: #fab387; }
.markdown-body .hljs-title { color: #89b4fa; }
.markdown-body .hljs-title.class_ { color: #f9e2af; }
.markdown-body .hljs-title.function_ { color: #89b4fa; }
.markdown-body .hljs-params { color: #cdd6f4; }
.markdown-body .hljs-comment { color: #9399b2; }
.markdown-body .hljs-doctag { color: #f38ba8; }
.markdown-body .hljs-meta { color: #fab387; }
.markdown-body .hljs-section { color: #89b4fa; }
.markdown-body .hljs-tag { color: #94e2d5; }
.markdown-body .hljs-name { color: #cba6f7; }
.markdown-body .hljs-attr { color: #89b4fa; }
.markdown-body .hljs-attribute { color: #a6e3a1; }
.markdown-body .hljs-bullet { color: #94e2d5; }
.markdown-body .hljs-code { color: #a6e3a1; }
.markdown-body .hljs-emphasis { color: #f38ba8; font-style: italic; }
.markdown-body .hljs-strong { color: #f38ba8; font-weight: bold; }
.markdown-body .hljs-formula { color: #94e2d5; }
.markdown-body .hljs-link { color: #74c7ec; font-style: italic; }
.markdown-body .hljs-quote { color: #a6e3a1; font-style: italic; }
.markdown-body .hljs-selector-tag { color: #f9e2af; }
.markdown-body .hljs-selector-id { color: #89b4fa; }
.markdown-body .hljs-selector-class { color: #94e2d5; }
.markdown-body .hljs-selector-attr { color: #cba6f7; }
.markdown-body .hljs-selector-pseudo { color: #94e2d5; }
.markdown-body .hljs-template-tag { color: #f2cdcd; }
.markdown-body .hljs-template-variable { color: #f2cdcd; }
.markdown-body .hljs-addition { color: #a6e3a1; background: rgba(166,227,161,0.15); }
.markdown-body .hljs-deletion { color: #f38ba8; background: rgba(243,139,168,0.15); }`;

export function loadCss(cssDir: string = EXT_DIR): { github: string; highlight: string } {
  try {
    const githubPath = join(cssDir, "node_modules", "github-markdown-css", "github-markdown-dark.css");
    return {
      github: readFileSync(githubPath, "utf-8"),
      highlight: CATPPUCCIN_MOCHA_HLJS,
    };
  } catch {
    return { github: "", highlight: CATPPUCCIN_MOCHA_HLJS };
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
  <summary>🧠 思考过程</summary>
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

/* ═══ Page Layout ═══ */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  color: #cdd6f4;
  background: #1e1e2e;
  padding: 0;
  margin: 0;
}
.page-header {
  text-align: center;
  padding: 1.25rem 1rem;
  font-size: 0.8rem;
  color: #6c7086;
  border-bottom: 1px solid #313244;
  letter-spacing: 0.3px;
}
.page-footer {
  text-align: center;
  padding: 1.25rem 1rem 2rem;
  font-size: 0.8rem;
  color: #7f849c;
  border-top: 1px solid #45475a;
  margin-top: 1.5rem;
}
.markdown-body {
  max-width: 820px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* ═══ Headings ═══ */
.markdown-body h1 {
  font-size: 1.75rem;
  font-weight: 800;
  border: none;
  border-left: 4px solid #cba6f7;
  padding: 0 0 0 0.75rem;
  margin: 0 0 1.25rem;
  background: linear-gradient(135deg, #f5c2e7, #cba6f7, #89b4fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.markdown-body h2 {
  font-size: 1.3rem;
  font-weight: 700;
  color: #89b4fa;
  border: none;
  border-bottom: 2px solid #45475a;
  padding: 0 0 0.35rem;
  margin: 1.75rem 0 0.75rem;
}
.markdown-body h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #94e2d5;
  margin: 1.5rem 0 0.5rem;
}
.markdown-body h4 {
  font-size: 1rem;
  font-weight: 600;
  color: #f9e2af;
  margin: 1.25rem 0 0.5rem;
}

/* ═══ Paragraphs ═══ */
.markdown-body p {
  margin: 0 0 1.25rem;
  color: #cdd6f4;
}

/* ═══ Tables ═══ */
.markdown-body table {
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #45475a;
  width: 100%;
  margin: 0 0 1.25rem;
}
.markdown-body th,
.markdown-body td {
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid #313244;
}
.markdown-body th {
  background: #313244;
  color: #cba6f7;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: left;
}
.markdown-body td {
  background: #1e1e2e;
  color: #cdd6f4;
}
.markdown-body tr:last-child td {
  border-bottom: none;
}
.markdown-body tr:nth-child(even) td {
  background: #232436;
}
.markdown-body tr:hover td {
  background: #313244;
}
  </style>
</head>
<body>
  <header class="page-header">Pi Agent Reply</header>
  <main class="markdown-body">
${thinkingBlock}${bodyHtml}
  </main>
  <footer class="page-footer">Generated by pi · Catppuccin Mocha</footer>
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
