# SPEC — my-permission-judge

AI 评审 authorizer link：当 `@gotgenes/pi-permission-system` 裁决为 `ask` 时，调用固定小模型 `deepseek/deepseek-v4-flash` 审查请求，返回 `allow` / `defer`；`deny` 与任何故障一律 `defer`（回退人工确认）。

## 架构

```
permission-system gate 裁决 = ask
        │  (authorizerChain: ["my-judge"])
        ▼
┌─ index.ts ─────────────────────────────────────────────┐
│ pi.on("session_start")        捕获 ctx（modelRegistry）│
│ pi.on("permissions:ready")    注册 authorizer link     │
│ pi.on("session_shutdown")     disposer 注销            │
└──────────────┬─────────────────────────────────────────┘
               ▼
┌─ judge.ts (纯逻辑, 100% 覆盖) ─────────────────────────┐
│ createJudge(review, notify) → authorize(details, query, log)  │
│   1. buildPrompt(details) → { system, user }                 │
│   2. await review(prompt) → rawText   (reviewer.ts)          │
│   3. parseVerdict(rawText) → {decision, reason?}             │
│   4. 映射 AuthorizerVerdict + log.review() 审计；allow / defer │
│     都 notify()（allow 用 info 附 reason，defer 用 warning 附原因；异常吞掉）│
│   任何异常 → { kind: "defer" }                                │
└──────────────┬─────────────────────────────────────────┘
               ▼
┌─ reviewer.ts (LLM IO 壳, 排除覆盖率) ──────────────────┐
│ createReviewer(getCtx) → async (messages) => string    │
│   getModel("deepseek","deepseek-v4-flash")             │
│   ctx.modelRegistry.getApiKeyAndHeaders(model)         │
│   complete(model, {messages}, {apiKey,headers,env,     │
│          signal: AbortSignal.timeout(20s)})            │
└────────────────────────────────────────────────────────┘
```

## 模块职责

### types.ts
- `JudgeDecision = "allow" | "defer"`（`deny` 视为 `defer`）
- `Verdict = { decision: JudgeDecision; reason?: string }`
- `ReviewFn = (prompt: JudgePrompt) => Promise<string>`（reviewer 注入点，测试可 mock）
- `NotifyFn = (message: string) => void | Promise<void>`（defer 通知用）
- 复用 `@gotgenes/pi-permission-system` 导出的 `Authorizer`、`AuthorizerLog`、`PermissionQuery`、`PromptPermissionDetails` 类型。

### judge.ts（纯函数 + 工厂，100% 覆盖）

- `buildPrompt(details: PromptPermissionDetails): JudgePrompt`
  - 返回 `{ system, user }` 两段文本（由 reviewer 组装为 pi-ai 消息）。
  - system：你是工具调用安全评审员。审查一次被权限系统标记为"需人工确认"的工具调用。只输出 JSON：`{"decision":"allow"|"defer","reason":"..."}`。判定标准：明显安全且符合开发常规 → allow；无法确定或存在任何风险 → defer。
  - user：结构化列出 surface、value（command/path/toolName 按存在性取舍）、agentName、message、toolInputPreview。
- `parseVerdict(raw: string): Verdict | null`
  - 从文本中提取第一个 JSON 对象（容忍 ```json 围栏与前后散文）；解析失败返回 `null`；
  - `decision` 必须是 `allow|defer` 之一，`deny` 也视为 `defer`；否则 `null`；
  - `reason` 非字符串时丢弃；`defer` 可附带 reason 用于日志。
- `createJudge(review: ReviewFn, notify?: NotifyFn): Authorizer["authorize"]`
  - 返回的 `authorize(details, query, log)`：
    1. `raw = await review(buildPrompt(details))`
    2. `verdict = parseVerdict(raw)`；`null` 或 `deny` → defer
    3. `log.review("my-judge", { requestId, surface, value, decision, reason })`
    4. 映射：allow → `{kind:"allow"}` + `notify("info", reason)`；defer / deny / 无 verdict → `{kind:"defer"}` + `notify("warning", 原因)`
       - defer（含 deny→defer）且 verdict 有 reason → 用 verdict.reason
       - 解析失败 → "无法解析评审结果"
       - review 抛异常 → 用异常 message
    5. notify 根据判决类型发不同消息（defer 必须写明原因）；内部异常吞掉（不得影响 verdict 返回）
  - 整体 try/catch：任何异常（含 review 抛错）→ `log.debug("my-judge:error", ...)` + `{kind:"defer"}`。
  - `query` 参数保留（链路契约要求），当前不使用。

### reviewer.ts（IO 壳，覆盖率排除）

- `createReviewer(getCtx: () => ExtensionContext | undefined): ReviewFn`
  - `getCtx()` 为 `undefined`（session 未启动）→ 抛错（由 judge 捕获转 defer）；
  - `getModel("deepseek", "deepseek-v4-flash")` 失败 / auth 不 ok / 无 apiKey → 抛错；
  - `complete(model, { messages }, { apiKey, headers, env, signal: AbortSignal.timeout(20000) })`；
  - 提取响应中所有 text block 拼接返回。

### index.ts（接线）

- 模块级 `let currentCtx`；`pi.on("session_start", (_e, ctx) => { currentCtx = ctx })`。
- `pi.events.on("permissions:ready", ...)`：通过 `globalThis[Symbol.for("@gotgenes/pi-permission-system:service")]` 直接取已发布服务（官方跨扩展机制，免去运行时 import 的包解析问题），`registerAuthorizer("my-judge", createJudge(createReviewer(() => currentCtx), notify))`，保存 disposer；service 不存在 → 静默跳过。类型用 `import type` 引入（编译期擦除，无运行时依赖）。
- `notify`：`currentCtx?.ui.notify(msg, type)`，try/catch 包裹，allow 用 `"info"`，defer 用 `"warning"`。
- `pi.on("session_shutdown")`：调用 disposer，清空 `currentCtx`。

## 模型与常量

| 常量 | 值 |
|---|---|
| provider / model | `deepseek` / `deepseek-v4-flash`（硬编码） |
| authorizer link 名 | `my-judge` |
| 超时 | 20s（`AbortSignal.timeout`） |

## 错误处理矩阵

| 场景 | 行为 |
|---|---|
| permission-system 未安装 | service 槽位为空 → 不注册 |
| service 未发布 | `globalThis` 槽位为 undefined → 不注册 |
| 重复注册（/reload 残留） | registerAuthorizer 抛错 → 捕获并记录 debug |
| session 未启动即收到 ask | reviewer 抛错 → judge 捕获 → defer |
| 模型未配置 / 无 API key | reviewer 抛错 → defer |
| 调用超时 / 网络错误 | complete 抛错 → defer |
| 返回 `deny` / decision 非法 | parseVerdict → 视为 `defer` |
| 缺 reason / 非字符串 reason | 丢弃或留空，不影响 `defer` |
| notify 抛错 | 吞掉，verdict 照常返回（allow / defer 均 notify） |

## 启用配置（仓库侧）

`pi-config/pi-permission-system.json` 顶层加：

```json
"authorizerChain": ["my-judge"]
```

## 测试策略

- `judge.test.ts`：`buildPrompt` 各字段取舍组合；`parseVerdict` 全分支（纯 JSON / 围栏 / 散文包裹 / 非法 JSON / 非法 decision / `deny` 视为 `defer` / reason 类型）；`createJudge` 两条 verdict 映射（allow / defer）+ allow 时 notify (info) + defer 时 notify (warning) + notify 抛错吞没 + review 抛错 + log 断言。mock `ReviewFn` / `NotifyFn`。
- `index.test.ts`：模拟 ExtensionAPI（`pi.on` / `pi.events.on`）+ 在 `globalThis` 放置假 service，验证 ready → 注册、service 缺失 → 静默、shutdown → disposer 调用。
- `reviewer.ts` 在 vitest.config 的 coverage.exclude 中（对齐 RealGitAdapter 惯例）。
- 覆盖率硬指标：branches / functions / lines / statements = 100（排除项如上）。

## 构建与部署

对齐 my-hud：`bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*' --external '@gotgenes/*'`；deploy 拷贝 `dist/index.js` 到 `~/.pi/agent/extensions/my-permission-judge/`。经 turbo 流水线 `build → test → deploy`。
