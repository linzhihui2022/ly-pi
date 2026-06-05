import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const EXT_DIR = __dirname;

export function loadCss(cssDir: string = EXT_DIR): { github: string; highlight: string } {
  try {
    const githubPath = join(cssDir, "node_modules", "github-markdown-css", "github-markdown-light.css");
    const hlPath = join(cssDir, "node_modules", "highlight.js", "styles", "github.css");
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
  <pre><code>${escapeHtml(thinkingText)}</code></pre>
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
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
}
.thinking-block summary {
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.thinking-block pre {
  margin-top: 0.75rem;
  background: #ffffff;
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #24292f;
  background: #ffffff;
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

export function extractAssistantText(
  content: Array<{ type: string; text?: string; thinking?: string }>,
  targetType: "text" | "thinking" = "text",
): string {
  return content
    .filter((block) => block.type === targetType)
    .map((block) => (targetType === "thinking" ? block.thinking : block.text) ?? "")
    .join("\n\n");
}
