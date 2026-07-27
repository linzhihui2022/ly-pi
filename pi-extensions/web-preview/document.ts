export interface HtmlDocumentOptions {
  title: string;
  bodyHtml: string;
  css?: string;
  js?: string;
}

export function buildHtmlDocument(options: HtmlDocumentOptions): string {
  const styleBlock = options.css
    ? `  <style>
${options.css}
  </style>
`
    : "";
  const scriptBlock = options.js
    ? `  <script>
${options.js}
  </script>
`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${options.title}</title>
${styleBlock}</head>
<body>
${options.bodyHtml}
${scriptBlock}</body>
</html>`;
}
