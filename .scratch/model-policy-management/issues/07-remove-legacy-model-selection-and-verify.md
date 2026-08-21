# 07 — 收敛旧模型选择并全局验收

**What to build:** 作为 ly-pi 维护者，我可以确认所有受管理模型选择都经由 Model Manifest、Model Policy Registry 或由其编译的 Pi 设置完成；旧硬编码和兼容读取路径不再造成第二个配置真源。

**Blocked by:** 02 — 用策略编译 Pi 默认与通用子代理; 03 — 迁移会话命名与 HUD; 04 — 迁移视觉与评论专用 agent; 06 — 迁移安全审计与权限 self-test

**Status:** resolved

- [x] 删除已迁移功能中的旧模型常量、重复 settings、独立 HUD 短名表、受管理 agent frontmatter 模型字段和直接 Provider 注册。
- [x] 仓库默认的具体 provider/model 标识仅保留在 Model Manifest 及其专属测试或文档说明中。
- [x] 不保留旧配置读取路径或静默兼容行为，失效配置得到可诊断错误。
- [x] `/models-doctor`、部署输出、标题、子代理、视觉和安全路径共同验证统一策略的最终行为。
- [x] 全量测试、类型检查、格式检查和文档检查通过。

## Comments

- 2026-08-21：风险评定为 High：本票据会删除 `my-permission` 的遗留模型配置，并涉及策略编译/部署设置的最终一致性。用户明确批准限定实施：删除已迁移路径的旧模型选择与兼容读取，补充迁移防线和验收；仅改仓库源码、测试和票据，运行 `bun run verify`；不发真实模型请求、不部署 `~/.pi`、不执行 `/reload`。
- 2026-08-21：实现收敛了 `my-permission` 的旧模型字段与无用配置参数；全部 PR 审查 agent 改由 Manifest 编译的 `standard` 覆写提供 thinking；迁移防线从 Manifest 动态派生候选，覆盖扩展源码/配置与 agent frontmatter。
- 2026-08-21：两轴审查发现的 HUD/自动标题静默配置错误已改为明确 UI 诊断。复审仍发现迁移防线无法拦截未列入当前 Manifest 的新 provider/model 硬编码，因此本票据恢复为 claimed，待补齐通用防线后再验收。`bun run verify` 已通过（64 test files / 907 tests）；未发真实模型请求，未部署 `~/.pi`，未执行 `/reload`。
- 2026-08-21：通用迁移防线现可拦截非 Manifest 的显式模型字面量、`fallbackModels`、拆分的 `defaultProvider` / `defaultModel` 以及 `.find(provider, id)` 调用；复审确认标题诊断无未处理 rejection。最终 `bun run verify` 已通过（64 test files / 908 tests）；未发真实模型请求，未部署 `~/.pi`，未执行 `/reload`。
