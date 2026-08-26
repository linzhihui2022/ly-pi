# 03 — 提供紧凑 bash 结果

**What to build:** Pi 用户执行 `bash` 时可直接看到命令和成功/失败状态；成功输出默认只显示有限行数，展开后仍看到 Pi 原生完整结果。用户可在 JSON 配置中调整折叠行数，错误不会因紧凑规则而丢失。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** resolved

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] `bash` 调用头显示实际命令和执行状态，成功输出默认最多显示 10 行
- [x] `bashCollapsedLines` 可调整成功输出的默认可见行数；缺失、损坏或非法字段安全回退到 10
- [x] 展开状态显示 Pi 实际返回的完整原始输出，且不会绕过 Pi 自身的截断
- [x] 失败时错误、可用 stdout/stderr 和失败状态保持可见，不应用成功折叠规则
- [x] 自动化测试覆盖默认值、有效/无效配置、折叠、展开与失败路径，且 `bun run verify` 通过

## Answer

- `my-tool-display` 现在仅在 `bash` 仍由 Pi 内置实现拥有时注册覆盖；执行继续委托 Pi 原生 definition，并使用实际 `ctx.cwd`，原生 metadata 与 call renderer 保留。
- Bash 成功输出默认显示最多 10 行，支持 JSON 中的 `bashCollapsedLines`（缺失、损坏、非整数或负值回退到 10）；展开时直接显示 Pi 返回文本。
- 失败结果不应用成功折叠规则，错误状态与可用 stdout/stderr 始终可见。成功/失败状态背景由 Pi 原生 TUI 根据 `isError` 提供。
- 验证：`bun run verify`（本 ticket 完成时的测试快照为 914 tests）通过；`bun run --cwd ly-pi build` 与 typecheck 通过；未执行部署或 `/reload`。
