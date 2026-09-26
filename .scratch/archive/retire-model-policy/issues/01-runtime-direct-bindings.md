# 01 — 迁移运行时 Direct Model Binding

**What to build:** 让权限 Judge、权限审计/合并、自动 Session Display Name 和 HUD 在不依赖 Model Policy Subsystem 的情况下继续提供既有用户可见功能：Judge 直接使用 Luna，审计/合并直接使用 Sol + high，标题直接使用 Luna，HUD 显示真实 `provider/id`。

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High — 权限 Judge 的模型路径变更。

**Approval:** Approved by the user in this session for ticket 01 only. Scope is limited to this ticket; ticket 02 remains pending explicit recorded High-risk implementation approval.

- [x] Judge 使用 Luna 的直接绑定且不传 `reasoningEffort`；模型缺失、异常、超时或非完整响应继续要求人工确认。
- [x] Advocate、Prosecutor、Chief Judge 与规则合并共用 Sol + high 的直接审计绑定；配置术语使用 `auditModel` 与 `auditThinking`；失败时不写入 `JUDGE.md`。
- [x] 自动 Session Display Name 使用 Luna 的直接绑定且不传 `reasoningEffort`；失败时保持未命名且不新增重试。
- [x] HUD 模型字段显示完整 `provider/id`，不再解析策略标签。
- [x] 测试覆盖上述直接调用与保守失败行为，并通过 `bun run verify`。

## Answer

已迁移权限、自动命名与 HUD 的运行时模型绑定，且不再由这些功能读取 Model Policy。权限失败保持人工确认或 no-write；相关失败路径现在显式断言 `JUDGE.md` 不会写入。`bun run verify` 通过（1153 tests），独立复审结论为 OK。
