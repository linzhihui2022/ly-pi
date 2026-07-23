# REQUIREMENTS — my-permission-judge

## 目标

当 `@gotgenes/pi-permission-system` 对一次工具调用的裁决结果为 `ask`（即将弹出人工确认框）时，先由一个固定的小模型（`deepseek/deepseek-v4-flash`）对该请求做额外审查，自动给出 `allow` / `defer`，减少无意义的人工打断，同时保证错误场景永远回退到人工确认。

## 做什么

1. 通过官方 Authorizer 链机制接入：在 `permissions:ready` 事件时调用 `getPermissionsService().registerAuthorizer("my-judge", authorize)` 注册评审 link。
2. 审查范围为**所有 surface 的 ask**（bash、path、mcp、skill、external_directory 等），不做 surface 过滤。
3. `authorize(details, query, log)` 流程：
   - 从 `PromptPermissionDetails` 提取 surface / value（command / path / toolName）/ message / toolInputPreview，组装审查 prompt；
   - 调用固定模型 `deepseek/deepseek-v4-flash`（`@earendil-works/pi-ai` 的 `complete()`），API key 经 `ctx.modelRegistry.getApiKeyAndHeaders()` 解析；
   - 解析模型返回的 JSON verdict，映射为 `AuthorizerVerdict`：`allow` / `defer`；`deny` 视为 `defer`（不主动拦截，只放行或回退人工）；
   - 通过 `log.review()` 记录每次评审结果（requestId、surface、value、decision、reason）。
4. **Fail-safe**：模型不可用、无 API key、调用超时、网络错误、返回无法解析、`decision` 不是 `allow` / `defer`（含 `deny`）——一律返回 `defer`（回退人工弹窗），绝不因自身故障放行或误拦。
5. **用户可见性**：AI 评审结果通过 `ctx.ui.notify(message)` 发 TUI 通知：allow → info 级别通知放行（附 reason），defer → warning 级别通知回退人工（附原因：AI 给出的 reason、解析失败原因、或异常信息）。`notify` 本身异常必须吞掉，不得影响裁决返回。
5. 评审调用设置 20s 超时（`AbortSignal.timeout`）。
6. 启用方式为 opt-in：在 `pi-config/pi-permission-system.json` 配置 `"authorizerChain": ["my-judge"]`；未配置时扩展注册了 link 也不会被调用。
7. `/reload` 安全：每次扩展初始化时在 `permissions:ready` 里重新注册；`session_shutdown` 时调用注册返回的 disposer。
8. permission-system 未安装或不可用时优雅降级（动态 import + try/catch，静默不注册）。
9. TDD：vitest，branches / functions / lines / statements 100% 覆盖（`types.ts`、`reviewer.ts`（LLM IO 壳）按仓库惯例排除）。

## 不做什么

- 不拦截 `policy_allow` / `policy_deny` —— 这些不经过 authorizer 链，也不应该经过。
- 不做配置文件：评审模型、超时时间均为代码内常量。
- 不做裁决缓存：相同请求每次重新评审。
- 不做重试：一次调用失败即 defer。
- 不主动 `deny`：评审只决定 `allow` 或 `defer`，`deny` 也回退到人工确认。
- 不修改 permission-system 本体，只消费其公开 API。

## 已知边界（permission-system 侧保证）

- `path` / `external_directory` surface 上 link 返回的 `allow` 会被链主的 bounded-delegation checkpoint 降级为 `defer`，AI 误判无法放行越权路径访问。
- link 抛异常会被链主捕获并按 `defer` 处理（fail-safe），但本扩展仍在内部消化所有异常，不依赖外层兜底。
