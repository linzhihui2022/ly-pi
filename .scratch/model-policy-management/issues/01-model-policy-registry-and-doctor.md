# 01 — 建立 Model Policy Registry 与诊断

**What to build:** 作为 ly-pi 使用者，我可以通过版本化 Model Manifest 查看并验证所有 Model Role 的默认策略，通过受限 Local Model Override 个性化普通候选，并使用 `/models-doctor` 在不发送真实请求的情况下定位模型配置、能力或主模型偏离问题。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Model Manifest 成为仓库默认策略、候选槽位、能力契约和角色失败语义的唯一真源。
- [x] 缺失 Local Model Override 时使用默认策略；普通槽位只可覆写 model、Model Label 和 thinking；安全角色及顺序、能力、失败语义的覆写被明确拒绝。
- [x] 单一 Model Policy Registry 对外提供角色执行、Pi 设置编译和诊断所需的稳定行为，并按固定顺序处理候选。
- [x] `/models-doctor` 显示角色、策略、候选来源、解析/能力诊断及实际 primary 相对初始选择的偏离，且不发送模型请求。
- [x] 测试覆盖 schema、覆写限制、能力校验、基础设施故障回退、协议错误不回退和角色失败结果。

## Comments

- 2026-08-21：用户明确批准在本票范围内实施 Model Manifest、Registry、Local Override、诊断命令及相关部署设置编译；不触及权限模块或真实发布。
- 2026-08-21：用户确认策略 thinking：fast 使用 `off`，standard 使用 `max`；其余策略沿用现有显式语义。
- 2026-08-21：已实现并完成两轴代码审查，未发现可操作问题。`compilePiSettings()` seam 已交付；将其写入 Pi 初始默认和 agentOverrides 的部署接线按依赖边界留给 02。
- 2026-08-21：验收通过：`bun run verify`（62 test files / 910 tests）、临时 staging deploy 集成测试，以及无效 Local Model Override 的部署期拒绝测试。
