# 01 — 清理已移除的 fallbackModels

**What to build:** 更新部署流程，迁移已有 Pi settings 中由 `pi-subagents` 移除的 `fallbackModels` 字段，避免旧本机配置阻止扩展启动。

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High — 修改仓库部署工作流的配置迁移行为。

**Approval:** 用户于 2026-09-15 在本会话明确选择“直接动手”，授权本票据范围内的 High-risk 实施、测试和部署验证。

## Scope

- 部署时从 `subagents.agentOverrides.*` 中删除已废弃的 `fallbackModels`。
- 同步处理 `subagents.agentOverridesByProvider.*.*` 中的同名字段。
- 保留每个 override 的 `model`、`thinking` 和其他合法字段，不修改本机模型选择。
- 添加 staging 部署回归测试。
- 不修改 `assets/config/settings.json` 中由本机所有的模型设置，不新增模型回退行为。

## Acceptance

- [x] 含有 `fallbackModels` 的旧本机 settings 经部署后不再含该字段。
- [x] 其他本机 override 字段和非 override 配置保持不变。
- [x] 未配置对应对象时部署行为保持不变。
- [x] `bun run verify` 通过。
- [x] `bun run deploy` 成功；部署后的启动探针不再报告扩展错误，用户随后可通过 `/reload` 验证。

## Comments

- 2026-09-15：已复现启动错误。`pi-subagents 0.68.0` 的 changelog 明确移除 `fallbackModels`；当前 `/Users/lychee/.pi/agent/settings.json` 的 `image-reader` override 仍保留空数组。仓库源配置不含该字段，部署脚本会保留本机自有模型设置，因此需要在部署边界增加窄范围迁移。
- 2026-09-15：新增部署迁移，清理普通和 provider-scoped agent overrides 中的 `fallbackModels`，保留模型与其他配置。回归测试先失败后通过；`bun run verify` 通过（76 个测试文件 / 1,268 项测试），`bun run deploy` 成功。重新运行原始 Pi 启动探针后不再出现扩展错误。
