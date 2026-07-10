# my-html Spec

> 状态：已确认，可作为开发基准  
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

my-html 为 Pi 提供 assistant 回复的 HTML 预览能力：
- 提取最近一条 assistant 消息。
- 渲染 Markdown 与思考过程为 HTML。
- 启动本地 HTTP 服务器并在浏览器中打开预览。

## 2. 模块结构

```
pi-extensions/my-html/
├── index.ts          # 扩展入口：注册 /html 命令与 session_shutdown 监听
├── render.ts         # Markdown → HTML、ANSI → HTML、代码块包装、完整文档
├── server.ts         # 本地 HTTP 预览服务器
├── types.ts          # 共享类型
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── my-html.json      # 配置占位
├── SPEC.md           # 本文档
└── REQUIREMENTS.md   # 需求清单
```

依赖方向：

```
index.ts → render.ts
        → server.ts
        → types.ts
```

## 3. `/html` 命令

### 3.1 触发

用户输入 `/html` 时执行。

### 3.2 查找 assistant 消息

从 `ctx.sessionManager.getEntries()` 末尾向前遍历，找到第一条 `type === "message" && message.role === "assistant"` 且包含 `text` 或 `thinking` 内容的 entry。

### 3.3 内容提取

- 对 `content` 数组中 `type === "text"` 的块，拼接 `text` 字段。
- 对 `content` 数组中 `type === "thinking"` 的块，拼接 `thinking` 字段。
- 忽略其他类型的内容块。

### 3.4 渲染流程

1. `renderMarkdownToHtml` 将 Markdown 转换为 HTML。
2. `wrapCodeBlocks` 为每个代码块添加头部（语言、复制按钮）。
3. 若存在 thinking 文本，生成可折叠的 `<details>` 块。
4. `buildHtmlDocument` 组合 CSS、标题、内容、页脚。

### 3.5 保存与打开

1. 获取 `sessionId`。
2. 在 `os.tmpdir()/pi-html-preview/<sessionId>/` 下创建目录。
3. 文件命名为 `<entryId>.html`。
4. 调用 `ensurePreviewServer` 获取或启动服务器。
5. 使用 `open` 打开浏览器。
6. 向用户通知预览 URL。

### 3.6 错误处理

- 找不到 assistant 回复：`notify("warning", "No agent reply to preview.")`。
- 服务器启动失败：`notify("error", ...)`。
- 浏览器打开失败：静默忽略。

## 4. Markdown 渲染

### 4.1 解析

- 使用 `marked` 与 `marked-highlight`。
- `highlight.js` 自动识别语言；未知语言回退为 `plaintext`。
- 代码块 class 为 `hljs language-<lang>`。

### 4.2 样式

- 加载 `github-markdown-css` 的 dark 主题。
- 注入自定义 Catppuccin Mocha 高亮主题。
- 自定义页面布局、标题、表格、列表、代码块、链接样式。

### 4.3 代码块

每个代码块被包装为：

```html
<div class="code-block-wrapper">
  <div class="code-block-header">
    <span>{lang}</span>
    <button onclick="copyCode(this)">📋 复制</button>
  </div>
  <pre><code>... contents ...</code></pre>
</div>
```

点击复制按钮将代码内容写入剪贴板，并临时显示 "✅ 已复制"。

### 4.4 思考过程

- 使用 `<details class="thinking-block">` 折叠。
- 将 ANSI 颜色转义序列（`38;2;R;G;B` 与 reset）转换为 HTML `<span style="color:rgb(...)">`。
- 仅支持 true-color 前景色与 reset。

## 5. 预览服务器

### 5.1 生命周期

- 首次 `/html` 调用时启动。
- `session_shutdown` 事件时停止。
- 单进程内只维持一个服务器实例。

### 5.2 端口选择

- 默认端口 `3456`。
- 若被占用，自动向后尝试最多 100 个端口。
- 找不到可用端口时抛错。

### 5.3 路由

- `GET /`：返回使用说明 HTML。
- `GET /<sessionId>/<entryId>.html`：读取文件并返回；不存在则 404。
- 其他方法或路径：返回 405 / 404。

### 5.4 安全

- 仅绑定 `127.0.0.1`。
- 仅读取已生成的 `.html` 预览文件。

## 6. 测试策略

- `render.ts`：Markdown 渲染、代码块包装、ANSI 转换、文档组装纯函数测试。
- `server.ts`：端口选择、路由、启动/停止逻辑测试（mock http）。
- `index.ts`：集成测试，mock ExtensionAPI、sessionManager、文件系统与 `open` 模块。
- 覆盖率目标：branches / functions / lines / statements 全部 100%。

## 7. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 持久化历史 HTML 文件 | 当前按会话临时目录保存 |
| 支持远程访问 | 仅绑定 localhost/127.0.0.1 |
| 实时同步更新 | 用户需重新执行 `/html` 刷新 |
| 自定义 CSS 主题 | 当前固定 Catppuccin Mocha |
| 渲染除 assistant 之外的消息 | 当前仅处理 assistant 回复 |

## 8. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 补充 my-html 需求与规格文档，确认 /html 命令、渲染、服务器与测试策略 |
