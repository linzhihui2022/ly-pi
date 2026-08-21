# 03 — 提供紧凑 bash 结果

**What to build:** Pi 用户执行 `bash` 时可直接看到命令和成功/失败状态；成功输出默认只显示有限行数，展开后仍看到 Pi 原生完整结果。用户可在 JSON 配置中调整折叠行数，错误不会因紧凑规则而丢失。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [ ] `bash` 调用头显示实际命令和执行状态，成功输出默认最多显示 10 行
- [ ] `bashCollapsedLines` 可调整成功输出的默认可见行数；缺失、损坏或非法字段安全回退到 10
- [ ] 展开状态显示 Pi 实际返回的完整原始输出，且不会绕过 Pi 自身的截断
- [ ] 失败时错误、可用 stdout/stderr 和失败状态保持可见，不应用成功折叠规则
- [ ] 自动化测试覆盖默认值、有效/无效配置、折叠、展开与失败路径，且 `bun run verify` 通过
