# 10 — 提高 Judge 全局超时

**What to build:** 将 my-permission 的全局 Judge 超时从 8 秒提高到 15 秒，以缓解已验证的 Luna 变种生成长尾延迟，同时保持超时后的失败闭合语义。

**Status:** resolved

## Scope

- `config.judgeTimeoutMs` 从 `8000` 改为 `15000`。
- 更新配置回归断言。
- 仅修改仓库源码、测试和票据；不部署 `~/.pi`、不执行 `/reload`、不发送真实模型请求。

## Acceptance

- [x] 默认 Judge 超时为 15,000ms。
- [x] 自测和权限 Judge 继续共享该配置的超时边界与失败闭合行为。
- [x] 受影响测试通过。
- [x] `bun run verify` 通过。

## Comments

- 2026-08-26：风险评定为 High，因为此配置控制权限确认与 self-test 的实际模型调用等待时间。Luna 已在相同 heredoc 生成提示下观测到 8,000ms、4,178ms、8,004ms 的串行结果，其中两次超时。用户明确批准将全局 `judgeTimeoutMs` 设为 15,000ms，仅实施源码与验证；不部署、不 reload、不发送真实模型请求。
- 2026-08-26：先将 `config.test.ts` 的默认值断言改为 15,000ms；目标测试如预期失败（实际为 8,000ms）。更新配置后，`config.test.ts` 与 `self-test.test.ts` 通过（21 tests）。
- 2026-08-26：`bun run verify` 通过：Biome、两个 tsgo typecheck、72 个 Vitest 文件 / 1,229 项测试和 check-docs 均通过。未部署、未 reload、未发送真实模型请求。
- 2026-08-26：用户明确授权提交当前已验收改动至 `model-change`。该授权不包含推送、部署、`/reload` 或真实模型请求。
