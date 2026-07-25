# 02 — /judge-log 输出 HTML 页面

**What to build:** 用户在会话中运行 `/judge-log` 时，不再收到终端文本列表，而是自动打开浏览器展示当前会话的 Judge Log 页面：表格列出每次法官判断（序号、工具、完整命令内容、判定结果与风险分数、用途、理由），最新判定在最前，顶部有「全部 / 安全 / 不安全」过滤按钮（纯客户端少量 JS，无框架）。每次运行覆盖同一固定文件，浏览器刷新即得最新列表；会话无任何法官判断时仅终端提示、不打开浏览器。同时删除被替换的 `formatJudgeLog` 及其测试；`recordJudgeStats` 与数据记录格式不变。

**Blocked by:** 01 — 抽取 web-preview 共享包，my-html 迁移依赖

**Status:** resolved

## Answer

已完成。`collectJudgeLogs`（沿用原校验规则、不截断、按时间正序收集）+ `renderJudgeLogPage` 纯函数（表格、最新在前、序号按时间正序、命令完整转义显示、全部/安全/不安全过滤按钮）+ handler 重写（空态仅 notify；有数据写固定 `judge-log.html`、起 server、`open` 打开、notify URL、失败 error notify）+ `session_shutdown` 停 server。`formatJudgeLog` 及其测试已删除，`recordJudgeStats` 与数据格式未动。`open` 依 my-html 先例由 my-permission 直接依赖（规格允许的二选一，未放入共享包）。my-permission 130 测试全绿，全文件覆盖率 100%；`turbo build test` 16/16、`check-docs` 全过；已 `bun run deploy` 并验证产物无 `formatJudgeLog` 残留。待办：交互会话中 `/reload` 后人工验证 `/judge-log`（需真实会话，无法在仓库内完成）。

- [ ] Judge Log 收集沿用现有 entry 校验规则（忽略非 judge entry 与字段缺失的 entry），结果按时间倒序
- [ ] 渲染纯函数产出完整页面：表格行内容正确、命令完整显示且 HTML 转义、过滤按钮与空列表文案存在；页面通过共享包的通用骨架生成
- [ ] handler：无记录时仅 notify「当前会话暂无法官判断」，不写文件不起 server；有记录时写入固定文件名（会话目录下 `judge-log.html`）、复用共享 server、打开浏览器、notify 预览 URL
- [ ] `my-permission` 不新增 marked/highlight.js 等 markdown 渲染依赖
- [ ] `formatJudgeLog` 及其测试已删除，无残留引用
- [ ] 测试覆盖三条接缝中的两条：渲染纯函数（过滤/倒序/转义/不截断/空态）与 handler 集成（空态行为、写文件、起 server、打开浏览器、notify URL），prior art 为 `my-html` 的对应测试
- [ ] 覆盖率维持 100%；`bunx turbo run build test` 与 `bun run check-docs` 通过；`bun run deploy` 后 `/reload` 人工验证 `/judge-log`
