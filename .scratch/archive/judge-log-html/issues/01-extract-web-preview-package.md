# 01 — 抽取 web-preview 共享包，my-html 迁移依赖

**What to build:** 新建 workspace 包 `web-preview`，将 HTML 预览能力沉淀为共享基础设施：静态预览 server（模块级单例、端口自动递增、只服务 `PREVIEW_DIR` 下的 `.html` 文件）、`PREVIEW_DIR` 约定、以及泛化的通用 HTML 骨架函数（接受标题、body HTML、可选内联 css/js，不含任何 markdown 渲染依赖）。`my-html` 改为依赖该包，markdown 渲染管线（marked、highlight.js、github-markdown-css）与 thinking 区块样式保留在 `my-html` 内。从用户视角：`/html` 命令行为完全不变。架构背景见 `docs/adr/0004-shared-web-preview-package.md`。

**Blocked by:** None — can start immediately

**Status:** resolved

## Answer

已完成。`web-preview` 包落地：通用 `buildHtmlDocument`（标题/body/可选 css+js）与预览 server（含 `PREVIEW_DIR`、端口自动递增）均 100% 覆盖率；`my-html` 改为依赖 `web-preview`（`workspace:*`，bundle 时内联），46 个既有测试全绿，`/html` 行为不变。偏离验收标准一处：`web-preview` 未配 build script —— 它作为库被消费方从源码 bundle，turbo `build` 对其为 no-op，`test` 正常纳入流水线。`turbo build test` 16/16 通过，`check-docs` 全过，README 扩展表已补录。已 `bun run deploy`。

- [ ] `web-preview` 包纳入 bun workspaces 与 turbo 流水线（build/test 可运行），含自身的 `buildHtmlDocument` 纯函数测试与 server 真实端口测试
- [ ] server 行为与迁入前一致：单例复用、端口被占自动递增、非 GET 返回 405、非 `.html` 路径 404
- [ ] 通用骨架支持注入自定义内联 css/js，不依赖 marked/highlight.js/github-markdown-css
- [ ] `my-html` 改为依赖 `web-preview`，其现有测试套件保持全绿，`/html` 行为（文件写入、server、打开浏览器、notify URL、session_shutdown 停 server）无回归
- [ ] 两个包覆盖率均维持 branches/functions/lines/statements 100%（排除项沿用各包既有约定）
- [ ] `bun run check-docs` 与 `bunx turbo run build test` 通过
