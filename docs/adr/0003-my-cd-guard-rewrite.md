# my-cd-guard：原地改写冗余 cd，而非拦截

pi agent 有防御性习惯：即使 bash 工具已在会话工作目录执行，仍频繁加上 `cd <当前目录> &&` 前缀（Redundant cd）。我们决定新建 `my-cd-guard` 扩展，在 `tool_call` 钩子中利用 `event.input` 的可变性**原地剥掉冗余 cd 前缀**并放行执行，同时 `ctx.ui.notify` 通知用户。

## Considered Options

- **拦截 + reason 逼 agent 重发**：被拒绝。冗余 cd 是无害噪音而非安全问题，拦截会让每条受影响命令多付一轮 agent 重试，成本远高于收益；改写零打断。
- **静默改写不通知**：被拒绝。通知能让用户观察到 agent 旧习复发的频率，为将来是否加强手段提供数据。
- **只保留提示词约束**：被拒绝。MY-AGENTS.md 已禁止冗余 cd，但模型习惯仍会偶发；改写是兜底。

## Consequences

- my-cd-guard 必须先于 my-script-guard 与 my-permission 生效，使后续扩展与模型法官看到纠正后的命令。统一入口下这一顺序由 `ly-pi/index.ts` 的注册顺序固定：`createGuardHarness(pi, [cdGuard, scriptGuard])` 先于 `myPermission(pi)`。
