# my-html 需求文档

> 状态：已确认，可作为开发基准  
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

为 Pi 提供本地 HTML 预览扩展，将最新 assistant 回复渲染成可读的 HTML 页面并在浏览器中打开。

## 功能需求

### `/html` 命令

1. 从当前会话 entries 中找到最近一条非空 assistant 消息。
2. 提取 `text` 与 `thinking` 内容块。
3. 将 Markdown 文本渲染为 HTML。
4. 将思考过程（如存在）以可折叠块形式展示。
5. 生成完整 HTML 文档并保存到临时目录。
6. 启动本地 HTTP 预览服务器（如尚未启动）。
7. 使用系统默认浏览器打开预览 URL。
8. 找不到 assistant 回复时提示用户。
9. 浏览器打开失败不阻塞命令，仅静默忽略。

### Markdown 渲染

1. 使用 `marked` 解析 Markdown。
2. 使用 `highlight.js` 对代码块进行语法高亮。
3. 使用 `github-markdown-css` 提供基础样式。
4. 代码块顶部显示语言标签与复制按钮。
5. 将 ANSI 颜色序列转换为 HTML 颜色（用于思考过程）。
6. 使用 Catppuccin Mocha 配色。

### 预览服务器

1. 使用 Node.js 原生 `http` 模块。
2. 默认监听 `127.0.0.1:3456`；端口被占用时自动向后寻找可用端口。
3. 仅支持 GET 请求。
4. 根路径返回使用说明。
5. 仅 `.html` 文件路径会被读取并返回；其他路径返回 404。
6. 文件按 `sessionId/entryId.html` 组织。
7. 会话关闭时停止服务器。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 覆盖率要求：branches / functions / lines / statements 全部 100%。
3. 构建命令：`bunx turbo run build`。
4. 测试命令：`bunx turbo run test` 或在扩展目录执行 `npx vitest run --coverage`。
5. 部署命令：`bun run deploy`，目标目录为 `~/.pi/agent/extensions/my-html`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 持久化历史 HTML 文件 | 当前按会话临时目录保存，会话关闭后清理依赖系统 |
| 支持远程访问 | 仅绑定 localhost/127.0.0.1 |
| 实时同步更新 | 用户需重新执行 `/html` 刷新 |
| 自定义 CSS 主题 | 当前固定 Catppuccin Mocha |
| 渲染除 assistant 之外的消息 | 当前仅处理 assistant 回复 |

## 验收标准

1. `/html` 能正确渲染 Markdown 代码块、表格、列表。
2. 思考过程正确渲染且可折叠。
3. 服务器自动选择可用端口并返回正确 URL。
4. 浏览器打开失败不抛异常。
5. 会话关闭时停止服务器。
6. 单元测试和覆盖率检查通过。
