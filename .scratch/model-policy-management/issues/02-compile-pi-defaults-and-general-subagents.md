# 02 — 用策略编译 Pi 默认与通用子代理

**What to build:** 作为 ly-pi 使用者，我修改 primary、fast 或 standard 的默认候选或合法本地覆写后，部署会一致地更新 Pi 的初始默认模型、thinking 以及 scout/delegate 的候选链，而不必编辑多个设置字段。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** resolved

- [x] deploy 从有效 Model Policy Registry 编译 primary 的初始默认模型和默认 thinking。
- [x] deploy 从 fast 与 standard 策略编译 scout、delegate 的模型、thinking 和固定顺序 fallback 配置。
- [x] 普通 Local Model Override 会影响编译结果；安全策略不会被该覆写改变。
- [x] 原 settings 中与这些受管理角色重复的具体模型选择被移除，且其他非模型设置保持不变。
- [x] 测试验证编译输出及部署合并行为，不依赖真实 provider 或凭据。

## Comments

- 2026-08-21：风险评定为 High（deploy settings）。在明确提示本票需要单独 High-risk 批准后，用户回复“下一步”，批准按本票既定验收范围实施。仅在临时 staging 验证；不部署到 `~/.pi`，不执行 reload。
- 2026-08-21：deployment 绑定在本票仅保留 scout 与 delegate；image-reader 和 pr-comment-analyzer 的策略接线由 04 处理，避免在其 frontmatter 迁移前提前改变专用 agent 行为。
- 2026-08-21：已完成 staging deploy 验证、两轴代码审查与 `bun run verify`（62 test files / 913 tests）；未发现可操作问题，未部署到 `~/.pi`。
