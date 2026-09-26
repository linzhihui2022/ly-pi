# 03 — 更新权限 Direct Model Binding

**What to build:** 在已退役 Model Policy Subsystem 的主线架构下，更新权限 Judge 与安全审计的直接模型绑定，同时保持 Pi 主模型、子代理和模型白名单由本机设置所有。

**Status:** resolved

**Risk:** High — 变更即时权限判定与安全审计实际调用的模型。

**Approval:** 用户已明确批准：Judge 使用 `deepseek/deepseek-flash`（不设置 / 不传递 `reasoningEffort`），Audit 使用 `openai-codex/gpt-6-astra` + `max`。范围限于源码、测试、提交、推送和创建 PR；不部署、不 reload、不发送真实模型请求。

## Scope

- `judgeModel` 改为 `deepseek/deepseek-flash`。
- `auditModel` 改为 `openai-codex/gpt-6-astra`，`auditThinking` 改为 `max`。
- 保持 Direct Model Binding，不恢复 Model Policy Subsystem。
- 不修改 `assets/config/settings.json` 中本机拥有的主模型、子代理或 `enabledModels` 设置。
- 更新相关测试与票据。

## Acceptance

- [x] Judge 直接绑定 DeepSeek Flash，且既有失败闭合语义保持不变。
- [x] Audit 直接绑定 GPT-6 Astra + max，且既有 no-write 语义保持不变。
- [x] 不重新引入 Manifest、角色路由或仓库拥有的 Pi 模型设置。
- [x] `bun run verify` 通过。

## Comments

- 2026-09-11：主线已通过 `retire-model-policy` 明确将主模型、子代理和模型白名单归为 Locally Owned Pi Model Settings。本票仅更新权限功能的 Direct Model Binding。
- 2026-09-11：先更新默认绑定断言；目标测试如预期失败（Judge 仍为 Luna），更新配置后通过（10 项）。
- 2026-09-11：`bun run verify` 通过：Biome、两个 tsgo typecheck、68 个 Vitest 文件 / 1,128 项测试和 check-docs 均通过。未部署、未 reload、未发送真实模型请求。
- 2026-09-11：PR 前审查发现真实配置与运行时 Direct Model Binding 缺少联动断言；新增 `direct-binding-config.test.ts`，覆盖 Judge Flash 不传递 `reasoningEffort`、Audit GPT-6 Astra 的 max effort，以及两者不可用时的失败闭合。`index.test.ts` 现从真实模型配置派生绑定。复验 `bun run verify` 通过（69 个 Vitest 文件 / 1,131 项测试）。
- 2026-09-11：复审发现两处测试描述仍将审计绑定称为 Sol；已改为配置驱动的 Audit Direct Model Binding。完整验收继续通过。
- 2026-09-11：最终文档复审发现“不传 `reasoningEffort`”不能等同于显式 `off`；已更正批准措辞，保持实现仅不设置该字段。完整验收继续通过。
