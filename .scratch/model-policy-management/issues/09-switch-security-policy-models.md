# 09 — 切换权限策略模型

**What to build:** 将权限即时 Judge 的 `security-judge` 策略切换到 Codex Luna，并将深度安全审计的 `security-audit` 策略切换到 Codex Sol，同时保留既有 failure policy 与 thinking 分层。

**Status:** resolved

## Scope

- `security-judge` 的 primary candidate 改为 `openai-codex/gpt-5.6-luna`，thinking 保持 `off`。
- `security-audit` 的 primary candidate 改为 `openai-codex/gpt-5.6-sol`，thinking 保持 `max`。
- 保留 `confirm` 与 `error-no-write` failure policy、能力契约和安全策略不可本地覆写约束。
- 仅修改仓库 Manifest、测试和本票据；不部署 `~/.pi`、不执行 `/reload`、不发送真实模型请求。

## Acceptance

- [x] Manifest 中 security-judge/security-audit 分别解析为已确认的 Codex candidate 与 thinking。
- [x] 角色的 failure policy、security 标记和能力契约保持不变。
- [x] 相关 Manifest/Registry 测试通过。
- [x] `bun run verify` 通过。

## Comments

- 2026-08-26：风险评定为 High，因为变更 `my-permission` 的即时权限判定和安全审计模型路由。用户明确批准：security-judge 使用 `openai-codex/gpt-5.6-luna` + `off`，security-audit 使用 `openai-codex/gpt-5.6-sol` + `max`；仅修改源码并验证，不部署、不 reload、不发送真实模型请求。
- 2026-08-26：已用 `pi --list-models` 确认 Luna 与 Sol 均可用，provider 为 `openai-codex`，context window 272K、max output 128K，均支持 thinking 与 images。
- 2026-08-26：先将 checked-in Manifest 的 security role candidate 断言改为目标 Codex 模型；`bun run --cwd ly-pi test -- --coverage.enabled=false model-policy/manifest.test.ts` 如预期失败，显示旧值仍为 DeepSeek Flash。更新 Manifest 与 label 后，同一命令通过（4 tests）。
- 2026-08-26：`bun run verify` 通过：Biome、两个 tsgo typecheck、72 个 Vitest 文件 / 1,229 项测试和 check-docs 均通过。未部署、未 reload、未发送真实模型请求。
- 2026-08-26：用户明确授权提交并普通推送当前已验收改动至 `model-change`。该授权不包含部署、`/reload` 或真实模型请求。
