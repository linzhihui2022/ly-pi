# Judge Log HTML 化

Status: ready-for-agent

## Problem Statement

`/judge-log` 目前以终端 notify 纯文本形式输出当前会话的每一次法官判断（Judge Log）。记录一多就难以阅读：长命令被截断到 60 字符、没有视觉层级、无法快速筛选出「不安全」的判定。用户无法方便地回顾法官的判断质量。

## Solution

模仿 `/html` 的交互：`/judge-log` 触发后，将当前会话的 Judge Log 渲染为一个 HTML 表格页面，写入固定文件，通过本地预览 server 在浏览器中打开。页面支持按「全部 / 安全 / 不安全」过滤，最新判定显示在最前。终端不再输出判断列表文本。

## User Stories

1. As a pi 用户, I want `/judge-log` 在浏览器中打开一个 HTML 页面, so that 我能在宽敞的阅读界面中回顾法官判断，而不是在终端 notify 里读 cramped 文本
2. As a pi 用户, I want 判断记录以表格呈现（序号、工具、命令、判定结果与风险分数、用途、理由）, so that 每条判断的关键信息一目了然
3. As a pi 用户, I want 最新的判断排在表格最前, so that 我打开页面第一眼就能看到最近的判定，无需滚到底
4. As a pi 用户, I want 完整看到被判断的命令内容（不再截断到 60 字符）, so that 我能核对法官实际评估的是什么
5. As a pi 用户, I want 页面顶部有「全部 / 安全 / 不安全」过滤按钮, so that 长会话中我能快速筛出被判定为不安全的调用
6. As a pi 用户, I want 每次运行 `/judge-log` 覆盖同一个 HTML 文件, so that 我可以留在同一个浏览器标签页，刷新即可看到最新列表，而不堆积快照文件
7. As a pi 用户, I want `/judge-log` 触发后自动打开浏览器并在终端 notify 预览 URL, so that 行为与 `/html` 一致、可预期
8. As a pi 用户, I want 在会话没有任何法官判断时只收到终端提示而不打开浏览器, so that 我不会被一个空页面打断
9. As a 扩展维护者, I want HTML 预览 server 与页面骨架由共享包 `web-preview` 提供, so that server 逻辑、端口策略与 `PREVIEW_DIR` 约定只有一处真相（见 ADR-0004）
10. As a 扩展维护者, I want `my-html` 改为依赖 `web-preview` 且行为不变, so that 共享包抽取不引入回归
11. As a 扩展维护者, I want `my-permission` 不引入 marked/highlight.js 等 markdown 渲染依赖, so that 它的 bundle 保持轻量

## Implementation Decisions

- 新建 workspace 包 `web-preview`（`pi-extensions/web-preview`），包含：
  - 静态预览 server（从 `my-html` 迁入，行为不变：模块级单例、端口自动递增、只服务 `PREVIEW_DIR` 下的 `.html` 文件）
  - `PREVIEW_DIR` 常量
  - 通用 `buildHtmlDocument` 骨架：接受标题、body HTML、可选内联 css/js，产出完整 HTML 文档；不含任何 markdown 渲染
- `my-html` 改造为依赖 `web-preview`：server 相关代码迁入共享包，markdown 渲染管线（marked、highlight.js、github-markdown-css）与 thinking 区块样式保留在 `my-html`
- `my-permission` 依赖 `web-preview`，新增：
  - Judge Log 收集逻辑：从 session entries 过滤出 Judge Log 记录（沿用现有 `JUDGE_STATS_CUSTOM_TYPE` 的校验规则），按时间倒序排列
  - 页面渲染纯函数：产出表格 + 过滤按钮的完整 body HTML 与少量内联 JS（纯客户端过滤，无框架）；命令内容完整显示并做 HTML 转义，CSS 控制换行
  - `/judge-log` handler 重写：无记录时仅 notify「当前会话暂无法官判断」；有记录时渲染页面写入 `<PREVIEW_DIR>/<sessionId>/judge-log.html`（固定文件名覆盖），ensure server，`open` 打开浏览器，notify 预览 URL
- 删除 `formatJudgeLog` 及其测试（终端文本输出被完全替换）；`recordJudgeStats` 与数据记录格式不变
- 两个扩展各自 bundle 时内联共享包代码，deploy 脚本与部署产物结构不变
- `open` 依赖：由 `my-permission` 新增（或随共享包统一导出，实现时择一，倾向共享包导出以保持「打开浏览器」能力也只有一处）

## Testing Decisions

好测试的标准：只测外部行为，不测实现细节。三条接缝：

1. **纯函数 seam —— Judge Log 页面渲染**：输入构造的 session entries，断言收集过滤（忽略非 judge entry、字段缺失的 entry）、倒序、表格行内容、命令不截断且转义、过滤按钮与空态文案存在
2. **command handler 集成 seam —— `/judge-log`**：mock `ExtensionAPI`/ctx，断言空态只 notify 不写文件、有数据时写固定文件名、起 server、打开浏览器、notify URL；prior art：`my-html/index.test.ts`
3. **web-preview 包自身**：`buildHtmlDocument` 纯函数测试（骨架、css/js 注入）；server 起真实端口测试（迁入的 `my-html/server.test.ts` 改造）；`my-html` 现有测试保持通过

覆盖率要求不变：branches/functions/lines/statements 全部 100%（排除项沿用各包既有约定）。

## Out of Scope

- 页面自动刷新（meta refresh / 轮询 / SSE）
- 跨会话的 Judge Log 历史与持久化查询
- 表格排序、搜索、分页等更重的客户端交互
- `/html` 命令本身的行为变更
- Judge 判定逻辑、`recordJudgeStats` 数据格式的任何改动

## Further Notes

- 架构背景见 `docs/adr/0004-shared-web-preview-package.md`
- 术语遵循 `CONTEXT.md`：Judge（法官）、Judge Log（法官判断日志）
- 流程：本规格确认后运行 `/to-tickets` 拆票到 `.scratch/judge-log-html/issues/`
